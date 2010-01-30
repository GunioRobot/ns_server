-module(stats_collector).

-define(SERVER, stats_collection_clock).

-include("mc_constants.hrl").
-include("mc_entry.hrl").

-behaviour(gen_event).
%% API
-export([start_link/0,
         monitor/3, unmonitor/2]).

%% gen_event callbacks
-export([init/1, handle_event/2, handle_call/2,
         handle_info/2, terminate/2, code_change/3]).

-record(state, {hostname, port, buckets}).
-record(topkey, {ops, ratio, evictions}).

start_link() ->
    {error, "Don't start_link this."}.

init([Hostname, Port, Buckets]) ->
    notify_monitoring(Hostname, Port, Buckets),
    {ok, #state{hostname=Hostname, port=Port, buckets=Buckets}}.

handle_event({collect, T}, State) ->
    collect(T, State),
    {ok, State}.

handle_call({set_buckets, Buckets}, State) ->
    Removed = State#state.buckets -- Buckets,
    Added = Buckets -- State#state.buckets,
    error_logger:info_msg("Added:  ~p, Removed:  ~p~n", [Added, Removed]),
    notify_monitoring(State#state.hostname, State#state.port, Added),
    notify_unmonitoring(State#state.hostname, State#state.port, Removed),
    {ok, ok, State#state{buckets=Buckets}}.

handle_info(_Info, State) ->
    {ok, State}.

terminate(_Reason, State) ->
    notify_unmonitoring(State#state.hostname, State#state.port,
                        State#state.buckets),
    ok.

code_change(_OldVsn, State, _Extra) ->
    {ok, State}.

notify_monitoring(Hostname, Port, Buckets) ->
    lists:foreach(fun (Bucket) ->
                          stats_aggregator:monitoring(Hostname,
                                                      Port,
                                                      Bucket)
                  end, Buckets).

notify_unmonitoring(Hostname, Port, Buckets) ->
        lists:foreach(fun (Bucket) ->
                          stats_aggregator:unmonitoring(Hostname,
                                                        Port,
                                                        Bucket)
                  end, Buckets).

collect(T, State) ->
    {ok, Sock} = gen_tcp:connect(State#state.hostname, State#state.port,
                                 [binary, {packet, 0}, {active, false}]),
    auth(Sock),
    collect(T, State, "default", Sock),
    % Collect all the other buckets
    lists:foreach(fun(B) ->
                          mc_client_binary:select_bucket(Sock, B),
                          collect(T, State, B, Sock)
                  end,
                  State#state.buckets -- ["default"]),
    ok = gen_tcp:close(Sock).

auth(Sock) ->
    Config = ns_config:get(),
    U = ns_config:search_prop(Config, bucket_admin, user),
    P = ns_config:search_prop(Config, bucket_admin, pass),
    auth(Sock, U, P).

auth(Sock, U, P) when is_list(U); is_list(P) ->
    % This command may not work unless bucket engine is running (and
    % creds are right).
    _X = mc_client_binary:auth(Sock, {"PLAIN", {U, P}}),
    ok.

collect(T, State, Bucket, Sock) ->
    {ok, _H, _E, Stats} = mc_client_binary:cmd(?STAT, Sock,
                              fun (_MH, ME, CD) ->
                                      dict:store(binary_to_list(ME#mc_entry.key),
                                                 binary_to_list(ME#mc_entry.data),
                                                 CD)
                              end,
                              dict:new(),
                              {#mc_header{}, #mc_entry{}}),
    stats_aggregator:received_data(T,
                                   State#state.hostname,
                                   State#state.port,
                                   Bucket,
                                   Stats),
    {ok, _H, _E, Topkeys} = mc_client_binary:cmd(?STAT, Sock,
                              fun (_MH, ME, CD) ->
                                      dict:store(binary_to_list(ME#mc_entry.key),
                                                 binary_to_list(ME#mc_entry.data),
                                                 CD)
                              end,
                              dict:new(),
                              {#mc_header{}, #mc_entry{key = <<"topkeys">>}}),
    stats_aggregator:received_topkeys(T,
                                      State#state.hostname,
                                      State#state.port,
                                      Bucket,
                                      parse_topkeys(Topkeys)).

parse_topkeys(Topkeys) ->
    dict:map(
        fun (_Key, Value) ->
                parse_topkey_value(Value)
        end,
        Topkeys).

parse_topkey_value(Value) ->
    Tokens = string:tokens(Value, [","]),
    Pairs = lists:map(
        fun (S) ->
                [K, V] = string:tokens(S, ["="]),
                {K, string:to_integer(V)}
        end,
        Tokens),
    Dict = dict:from_list(Pairs),
    dict:map(
        fun (_Key, TopkeyDict) ->
                topkey_dict_to_tuple(TopkeyDict)
        end,
        Dict).

accumulate(Keys, Dict) ->
    lists:foldl(
        fun (Key, Acc) ->
                Acc + dict:fetch(Key, Dict)
        end,
        0,
        Keys).

topkey_dict_to_tuple(TopkeyDict) ->
    Ctime = dict:fetch("ctime", TopkeyDict),
    Hits = accumulate(TopkeyDict, ["get_hits", "incr_hits", "decr_hits", "delete_hits"]),
    Ops = Hits + accumulate(TopkeyDict, ["get_misses", "incr_misses", "decr_misses", "delete_misses"]),
    Sets = dict:fetch("cmd_set", TopkeyDict),
    Evictions = dict:fetch("cmd_set", TopkeyDict),
    #topkey{ops = (Ops + Sets) / Ctime, ratio = Hits / Ops, evictions = Evictions / Ctime}.

%
%% Entry Points.
%

monitor(Hostname, Port, Buckets) ->
    case gen_event:call(?SERVER, {?MODULE, {Hostname, Port}},
                        {set_buckets, Buckets}) of
        {error, bad_module} ->
            ok = gen_event:add_handler(?SERVER, {?MODULE, {Hostname, Port}},
                                       [Hostname, Port, Buckets]);
        ok -> ok
    end.

unmonitor(Hostname, Port) ->
    ok = gen_event:delete_handler(?SERVER, {?MODULE, {Hostname, Port}}, []).
