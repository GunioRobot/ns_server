
-module(ns_heart).

-behaviour(gen_server).
-export([start_link/0]).
-export([init/1, handle_call/3, handle_cast/2, handle_info/2, terminate/2,
         code_change/3]).

%% gen_server handlers

start_link() ->
    gen_server:start_link({local, ?MODULE}, ?MODULE, [], []).

init([]) ->
    timer:send_interval(1000, beat),
    {ok, empty_state}.

handle_call(_Request, _From, State) -> {reply, empty_reply, State}.

handle_cast(_Msg, State) -> {noreply, State}.

handle_info(beat, State) ->
    ns_doctor:heartbeat(current_status()),
    {noreply, State}.

terminate(_Reason, _State) -> ok.

code_change(_OldVsn, State, _Extra) -> {ok, State}.

%% API

%% Internal fuctions
current_status() ->
    NodeInfo = element(2, ns_info:basic_info()),
    lists:append([
        [proplists:property(memcached_running, is_memcached_running())],
        NodeInfo]).

is_memcached_running() ->
    length(ns_port_sup:current_ports()) == 1.
