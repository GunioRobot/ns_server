//= require <jquery.js>
//= require <jqModal.js>
//= require <jquery.flot.js>
//= require <jquery.ba-bbq.js>
//= require <underscore.js>
//= require <tools.tabs.js>
//= require <jquery.cookie.js>
//= require <misc.js>
//= require <base64.js>
//= require <mkclass.js>
//= require <callbacks.js>
//= require <cells.js>
//= require <hash-fragment-cells.js>
//= require <right-form-observer.js>
//= require <app-misc.js>
//= require <core-data.js>
//= require <analytics.js>
//= require <manage-servers.js>
//= require <settings.js>
//= require <manage-buckets.js>
//= require <monitor-buckets.js>

// TODO: doesn't work due to apparent bug in jqModal. Consider switching to another modal windows implementation
// $(function () {
//   $(window).keydown(function (ev) {
//     if (ev.keyCode != 0x1b) // escape
//       return;
//     console.log("got escape!");
//     // escape is pressed, now check if any jqModal window is active and hide it
//     _.each(_.values($.jqm.hash), function (modal) {
//       if (!modal.a)
//         return;
//       $(modal.w).jqmHide();
//     });
//   });
// });


var LogoutTimer = {
  reset: function () {
    if (this.timeoutId) {
      clearTimeout(this.timeoutId);
    }
    if (!DAO.login)
      return;
    this.timeoutId = setTimeout($m(this, 'onTimeout'), 300000);
  },
  onTimeout: function () {
    $.cookie('inactivity_reload', '1');
    DAO.setAuthCookie(null);
    reloadApp();
  }
};

var OverviewSection = {
  initLater: function () {
    BucketsSection.cells.detailedBuckets.subscribeValue(function (buckets) {
      $('#overview .buckets-number').text(buckets ? buckets.length : '??');
    });

    DAO.cells.serversCell.subscribeValue(function (servers) {
      $('.active-servers-count').text(servers ? servers.active.length : '??');

      var block = $('#overview_servers_block');
      if (!servers) {
        block.find('.alert_num').hide();
        return;
      }
      var pendingEject = servers.pendingEject;
      var failedOver = _.select(servers.allNodes, function (node) {
        return node.clusterMembership == 'inactiveFailed';
      });
      var pendingAdd = _.select(servers.allNodes, function (node) {
        return node.clusterMembership == 'inactiveAdded';
      });

      function updateCount(selector, count) {
        var span = block.find(selector).text(count);
        span.parents('.alert_num')[count ? 'show' : 'hide']();
      }

      updateCount('.failed-over-count', failedOver.length);
      updateCount('.pending-add-count', pendingAdd.length);
      updateCount('.pending-eject-count', pendingEject.length);
    });

    var spinner;
    BucketsSection.cells.detailedBuckets.subscribeValue(function (buckets) {
      var poolDetails = DAO.cells.currentPoolDetailsCell.value;
      if (!poolDetails || !buckets) {
        if (!spinner)
          spinner = overlayWithSpinner('#overview_clusters_block');
        return;
      }
      if (spinner) {
        spinner.remove();
        spinner = null;
      }

      var item = $('#overview_clusters_block .ram-item');

      var usedQuota = _.reduce(buckets, 0, function (acc, info) {
        return acc + info.basicStats.memUsed;
      });
      var bucketsQuota = _.reduce(buckets, 0, function (acc, info) {
        return acc + info.quota.ram;
      });
      var quotaTotal = poolDetails.storageTotals.ram.quotaTotal;
      item.find('.cluster-total').text(ViewHelpers.formatQuantity(quotaTotal, null, null, ' '));
      item.find('.used-quota').text(ViewHelpers.formatQuantity(usedQuota, null, null, ' '));
      item.find('.buckets-quota').text(ViewHelpers.formatQuantity(bucketsQuota, null, null, ' '));
      item.find('.unused-quota').text(ViewHelpers.formatQuantity(bucketsQuota - usedQuota, null, null, ' '));
      item.find('.quota-free').text(ViewHelpers.formatQuantity(quotaTotal - bucketsQuota, null, null, ' '));

      item.find('.used').css('width', calculatePercent(usedQuota, quotaTotal) + '%');
      item.find('.free').css('width', calculatePercent(bucketsQuota - usedQuota, quotaTotal) + '%');
    });
  },
  init: function () {
    _.defer($m(this, 'initLater'));
  },
  onEnter: function () {
  }
};

;(function () {
  var weekDays = "Sun Mon Tue Wed Thu Fri Sat".split(' ');
  var monthNames = "Jan Feb Mar Apr May Jun Jul Aug Sep Oct Nov Dec".split(' ');
  function _2digits(d) {
    d += 100;
    return String(d).substring(1);
  }

  window.formatAlertTStamp = formatAlertTStamp;
  function formatAlertTStamp(mseconds) {
    var date = new Date(mseconds);
    var rv = [weekDays[date.getDay()],
      ' ',
      monthNames[date.getMonth()],
      ' ',
      date.getDate(),
      ' ',
      _2digits(date.getHours()), ':', _2digits(date.getMinutes()), ':', _2digits(date.getSeconds()),
      ' ',
      date.getFullYear()];

    return rv.join('');
  }

  window.formatLogTStamp = function formatLogTStamp(mseconds) {
    var date = new Date(mseconds);
    var rv = [
      "<strong>",
      _2digits(date.getHours()), ':', _2digits(date.getMinutes()), ':', _2digits(date.getSeconds()),
      "</strong> - ",
      weekDays[date.getDay()],
      ' ',
      monthNames[date.getMonth()],
      ' ',
      date.getDate(),
      ', ',
      date.getFullYear()];

    return rv.join('');
  }
})();

function formatAlertType(type) {
  switch (type) {
  case 'warning':
    return "Warning";
  case 'attention':
    return "Needs Your Attention";
  case 'info':
    return "Informative";
  }
}

var AlertsSection = {
  renderAlertsList: function () {
    var value = this.alerts.value;
    renderTemplate('alert_list', _.clone(value.list).reverse());
  },
  changeEmail: function () {
    SettingsSection.gotoSetupAlerts();
  },
  init: function () {
    this.active = new Cell(function (mode) {
      return (mode == "alerts" || mode == "log") ? true : undefined;
    }).setSources({mode: DAO.cells.mode});

    this.alerts = new Cell(function (active) {
      var value = this.self.value;
      var params = {url: "/alerts"};
      return future.get(params);
    }).setSources({active: this.active});
    this.alerts.keepValueDuringAsync = true;
    prepareTemplateForCell("alert_list", this.alerts);
    this.alerts.subscribe($m(this, 'renderAlertsList'));
    this.alerts.subscribe(function (cell) {
      // refresh every 30 seconds
      cell.recalculateAt((new Date()).valueOf() + 30000);
    });

    this.alertTab = new TabsCell("alertsTab",
                                 "#alerts .tabs",
                                 "#alerts .panes > div",
                                 ["log", "list"]);

    _.defer(function () {
      SettingsSection.advancedSettings.subscribe($m(AlertsSection, 'updateAlertsDestination'));
    });

    this.logs = new Cell(function (active) {
      return future.get({url: "/logs"}, undefined, this.self.value);
    }).setSources({active: this.active});
    this.logs.subscribe(function (cell) {
      cell.recalculateAt((new Date()).valueOf() + 30000);
    });
    this.logs.subscribe($m(this, 'renderLogsList'));
    prepareTemplateForCell('alert_logs', this.logs);
  },
  renderLogsList: function () {
    renderTemplate('alert_logs', _.clone(this.logs.value.list).reverse());
  },
  updateAlertsDestination: function () {
    var cell = SettingsSection.advancedSettings.value;
    var who = ''
    if (cell && ('email' in cell)) {
      who = cell.email || 'nobody'
    }
    $('#alerts_email_setting').text(who);
  },
  onEnter: function () {
  },
  navClick: function () {
    if (DAO.cells.mode.value == 'alerts' ||
        DAO.cells.mode.value == 'log') {
      this.alerts.setValue(undefined);
      this.logs.setValue(undefined);
      this.alerts.recalculate();
      this.logs.recalculate();
    }
  },
  domId: function (sec) {
    return 'alerts';
  }
}
var DummySection = {
  onEnter: function () {}
};

var BreadCrumbs = {
  update: function () {
    var sec = DAO.cells.mode.value;
    var path = [];

    function pushSection(name) {
      var el = $('#switch_' + name);
      path.push([el.text(), el.attr('href')]);
    }

    var container = $('.bread_crumbs > ul');
    container.html('');

    $('.currentNav').removeClass('currentNav');
    $('#switch_' + sec).addClass('currentNav');

    // TODO: Revisit bread-crumbs for server-specific or bucket-specific drill-down screens.
    //
    return;

    if (sec == 'analytics' && DAO.cells.statsBucketURL.value) {
      pushSection('buckets')
      var bucketInfo = DAO.cells.currentStatTargetCell.value;
      if (bucketInfo) {
        path.push([bucketInfo.name, '#visitBucket='+bucketInfo.uri]);
      }
    } else
      pushSection(sec);

    _.each(path.reverse(), function (pair) {
      var name = pair[0];
      var href = pair[1];

      var li = $('<li></li>');
      var a = $('<a></a>');
      a.attr('href', href);
      a.text(name);

      li.prepend(a);

      container.prepend(li);
    });

    container.find(':first-child').addClass('nobg');
  },
  init: function () {
    var cells = DAO.cells;
    var update = $m(this, 'update');

    cells.mode.subscribe(update);
    cells.statsBucketURL.subscribe(update);
    cells.currentStatTargetCell.subscribe(update);
  }
};

var ThePage = {
  sections: {overview: OverviewSection,
             servers: ServersSection,
             analytics: AnalyticsSection,
             buckets: BucketsSection,
             alerts: AlertsSection,
             log: AlertsSection,
             settings: SettingsSection,
             monitor_buckets: MonitorBucketsSection,
             monitor_servers: OverviewSection},

  coming: {monitor_servers:true, settings:true},

  currentSection: null,
  currentSectionName: null,
  signOut: function () {
    $.cookie('auth', null);
    reloadApp();
  },
  ensureSection: function (section) {
    if (this.currentSectionName != section)
      this.gotoSection(section);
  },
  gotoSection: function (section) {
    if (!(this.sections[section])) {
      throw new Error('unknown section:' + section);
    }
    if (this.currentSectionName == section) {
      if ('navClick' in this.currentSection)
        this.currentSection.navClick();
      else
        this.currentSection.onEnter();
    } else
      setHashFragmentParam('sec', section);
  },
  initialize: function () {
    _.each(_.uniq(_.values(this.sections)), function (sec) {
      if (sec.init)
        sec.init();
    });
    BreadCrumbs.init();

    DAO.onReady(function () {
      if (DAO.login) {
        $('.sign-out-link').show();
      }
    });

    var self = this;
    watchHashParamChange('sec', 'overview', function (sec) {
      var oldSection = self.currentSection;
      var currentSection = self.sections[sec];
      if (!currentSection) {
        self.gotoSection('overview');
        return;
      }
      self.currentSectionName = sec;
      self.currentSection = currentSection;

      DAO.switchSection(sec);

      var secId = sec;
      if (currentSection.domId != null) {
        secId = currentSection.domId(sec);
      }

      if (self.coming[sec] == true && window.location.href.indexOf("FORCE") < 0) {
        secId = 'coming';
      }

      $('#mainPanel > div:not(.notice)').css('display', 'none');
      $('#'+secId).css('display','block');

      // Allow reuse of same section DOM for different contexts, via CSS.
      // For example, secId might be 'buckets' and sec might by 'monitor_buckets'.
      $('#'+secId)[0].className = sec;

      _.defer(function () {
        if (oldSection && oldSection.onLeave)
          oldSection.onLeave();
        self.currentSection.onEnter();
        $(window).trigger('sec:' + sec);
      });
    });
  }
};

function hideAuthForm() {
  $(document.body).removeClass('auth');
}

function loginFormSubmit() {
  var login = $('#login_form [name=login]').val();
  var password = $('#login_form [name=password]').val();
  var spinner = overlayWithSpinner('#login_form', false);
  $('#auth_dialog .alert_red').hide();
  $('#login_form').addClass('noform');
  DAO.performLogin(login, password, function (status) {
    spinner.remove();
    $('#login_form').removeClass('noform');

    if (status == 'success') {
      hideAuthForm();
      return;
    }

    $('#auth_failed_message').show();
  });
  return false;
}

$(function () {
  $(document.body).removeClass('nojs');
  $(document.body).addClass('auth');

  _.defer(function () {
    var e = $('#auth_dialog [name=login]').get(0);
    try {e.focus();} catch (ex) {}
  });

  if ($.cookie('inactivity_reload')) {
    $.cookie('inactivity_reload', null);
    $('#auth_inactivity_message').show();
  }

  if ($.cookie('cluster_join_flash')) {
    $.cookie('cluster_join_flash', null);
    displayNotice('You have successfully joined the cluster');
  }
  if ($.cookie('rf')) {
    displayNotice('An error was encountered when requesting data from the server.  ' +
		  'The console has been reloaded to attempt to recover.  There ' +
		  'may be additional information about the error in the log.');
    DAO.onReady(function () {
      $.cookie('rf', null);
      if ('sessionStorage' in window && window.sessionStorage.reloadCause) {
        postClientErrorReport("Browser client XHR failure encountered.  Diagnostic info: " + window.sessionStorage.reloadCause);
        delete window.sessionStorage.reloadCause;
      }
    });
  }

  ThePage.initialize();

  DAO.onReady(function () {
    $(window).trigger('hashchange');
  });

  $('#server_list_container .expander, #server_list_container .name').live('click', function (e) {
    var container = $('#server_list_container');
    var mydetails = $(e.target).parents("#server_list_container .primary").next();
    var opened = mydetails.hasClass('opened');

    mydetails.toggleClass('opened', !opened);
    mydetails.prev().find(".expander").toggleClass('expanded', !opened);
  });

  var spinner = overlayWithSpinner('#login_form', false);
  try {
    if (DAO.tryNoAuthLogin()) {
      hideAuthForm();
    }
  } finally {
    try {
      spinner.remove();
    } catch (__ignore) {}
  }
});

$(window).bind('template:rendered', function () {
  $('table.lined_tab tr:has(td):odd').addClass('highlight');
});

$('.remove_bucket').live('click', function() {
  BucketsSection.startRemovingBucket();
});

function showAbout() {
  function updateVersion() {
    var components = DAO.componentsVersion;
    if (components)
      $('#about_versions').text("Version: " + components['ns_server']);
    else {
      $.get('/versions', function (data) {
        DAO.componentsVersion = data.componentsVersion;
        updateVersion();
      }, 'json')
    }
  }
  updateVersion();
  showDialog('about_server_dialog');
}

function showInitDialog(page, opt) {
  $('.page-header').hide();

  opt = opt || {};

  var pages = [ "welcome", "cluster", "resources", "secure" ];

  if (page == "")
    page = "welcome";

  if (false)        // If the cluster appears to be configured
    page = "done";  // then don't let user go back through init dialog.

  for (var i = 0; i < pages.length; i++) {
    if (page == pages[i]) {
      if (NodeDialog["startPage_" + page]) {
        NodeDialog["startPage_" + page]('self', 'init_' + page, opt);
      }
      $(document.body).addClass('init_' + page);
    }
  }

  for (var i = 0; i < pages.length; i++) { // Hide in a 2nd loop for more UI stability.
    if (page != pages[i]) {
      $(document.body).removeClass('init_' + pages[i]);
    }
  }

  if (page == "done")
    $('.page-header').show();

  //  if (DAO.initStatus != page) {
  //  DAO.initStatus = page;
  //   $.ajax({
  //    type:'POST', url:'/node/controller/initStatus', data: 'value=' + page
  //  });
  //}

  if (page != 'done') {
    var notices = [];
    $('#notice_container > *').each(function () {
      var text = $.data(this, 'notice-text');
      if (!text)
        return;
      notices.push(text);
    });
    if (notices.length) {
      $('#notice_container').html('');
      alert(notices.join("\n\n"));
    }
  }
}

var NodeDialog = {
  submitClusterForm: function (e) {
    if (e)
      e.preventDefault();

    var form = $('#init_cluster_form');

    if ($('#no-join-cluster')[0].checked)
      return showInitDialog('resources');

    var errorsContainer = form.parent().find('.join_cluster_dialog_errors_container');
    errorsContainer.hide();

    var data = ServersSection.validateJoinClusterParams(form);
    if (data.length) {
      renderTemplate('join_cluster_dialog_errors', data, errorsContainer[0]);
      errorsContainer.show();
      return;
    }

    var hostname = data.hostname;
    data.clusterMemberHostIp = hostname;
    data.clusterMemberPort = '8080';
    if (hostname.indexOf(':') >= 0) {
      var arr = hostname.split(':');
      data.clusterMemberHostIp = arr[0];
      data.clusterMemberPort = arr[1];
    }
    delete data.hostname;

    var overlay = overlayWithSpinner($('#init_cluster_dialog'), '#EEE');
    postWithValidationErrors('/node/controller/doJoinCluster', $.param(data), function (errors, status) {
      if (status != 'success') {
        overlay.remove();
        renderTemplate('join_cluster_dialog_errors', errors, errorsContainer[0]);
        errorsContainer.show();
        return;
      }

      DAO.setAuthCookie(data.user, data.password);
      $.cookie('cluster_join_flash', 1);
      _.delay(function () {
        DAO.tryNoAuthLogin();
        overlay.remove();
      }, 5000);
    }, {
      timeout: 8000
    });
  },
  startMemoryDialog: function (node) {
    var parentName = '#edit_server_memory_dialog';

    $(parentName + ' .quota_error_message').hide();

    $.ajax({
      type:'GET', url:'/nodes/' + node, dataType: 'json', async: false,
      success: cb, error: cb});

    function cb(data, status) {
      if (status == 'success') {
        var m = data['memoryQuota'];
        if (m == null || m == "none") {
          m = "";
        }

        $(parentName).find('[name=quota]').val(m);
      }
    }

    $(parentName + ' button.save_button').click(function (e) {
        e.preventDefault();

        $(parentName + ' .quota_error_message').hide();

        var m = $(parentName).find('[name=quota]').val() || "";
        if (m == "") {
          m = "none";
        }

        $.ajax({
          type:'POST', url:'/nodes/' + node + '/controller/settings',
          data: 'memoryQuota=' + m,
          async:false, success:cbPost, error:cbPost
        });

        function cbPost(data, status) {
          if (status == 'success') {
            $(parentName).jqmHide();

            showInitDialog("resources"); // Same screen used in init-config wizard.
          } else {
            $(parentName + ' .quota_error_message').show();
          }
        }
      });

    showDialog('edit_server_memory_dialog');
  },

  startAddLocationDialog : function (node, storageKind) {
    var parentName = '#add_storage_location_dialog';

    $(parentName + ' .storage_location_error_message').hide();

    $(parentName).find('input[type=text]').val();

    $(parentName + ' button.save_button').click(function (e) {
        e.preventDefault();

        $(parentName + ' .storage_location_error_message').hide();

        var p = $(parentName).find('[name=path]').val() || "";
        var q = $(parentName).find('[name=quota]').val() || "none";

        $.ajax({
          type:'POST', url:'/nodes/' + node + '/controller/resources',
          data: 'path=' + p + '&quota=' + q + '&kind=' + storageKind,
          async:false, success:cbPost, error:cbPost
        });

        function cbPost(data, status) {
          if (status == 'success') {
            $(parentName).jqmHide();

            showInitDialog("resources");
          } else {
            $(parentName + ' .storage_location_error_message').show();
          }
        }
      });

    $(parentName + ' .add_storage_location_title').text("Add " + storageKind.toUpperCase() + " Storage Location");

    showDialog('add_storage_location_dialog');
  },

  startRemoveLocationDialog : function (node, path) {
    if (confirm("Are you sure you want to remove the storage location: " + path + "?  " +
                "Click OK to Remove.")) {
      $.ajax({
        type:'DELETE',
        url:'/nodes/' + node + '/resources/' + encodeURIComponent(path),
        async:false
      });

      showInitDialog("resources"); // Same screen used in init-config wizard.
    }
  },

  // The pagePrefix looks like 'init_license', and allows reusability.
  startPage_license: function(node, pagePrefix, opt) {
    var parentName = '#' + pagePrefix + '_dialog';

    opt = opt || {};

    $(parentName + ' .license_failed_message').hide();

    $.ajax({
      type:'GET', url:'/nodes/' + node, dataType: 'json', async: false,
      success: cb, error: cb});

    function cb(data, status) {
      if (status == 'success') {
        var lic = data.license;
        if (lic == null || lic == "") {
          lic = "2372AA-F32F1G-M3SA01"; // Hardcoded BETA license.
        }

        $(parentName).find('[name=license]').val(lic);
      }
    }

    var submitSelector = opt['submitSelector'] || 'input.next';

    $(parentName + ' ' + submitSelector).click(function (e) {
        e.preventDefault();

	showInitDialog("cluster");
        //$(parentName + ' .license_failed_message').hide();

        //var license = $(parentName).find('[name=license]').val() || "";

        //$.ajax({
        //  type:'POST', url:'/nodes/' + node + '/controller/settings',
        //  data: 'license=' + license,
        //  async:false, success:cbPost, error:cbPost
        //});

        //function cbPost(data, status) {
          //if (status == 'success') {
            //if (opt['successFunc'] != null) {
              //opt['successFunc'](node, pagePrefix);
	      //} else {
              //showInitDialog(opt["successNext"] || "resources");
	      //}
	    //} else {
            //$(parentName + ' .license_failed_message').show();
	    //}
	  //}
      });
  },
  startPage_resources: function(node, pagePrefix, opt) {
    var self = this;
    var parentName = '#' + pagePrefix + '_dialog';

    opt = opt || {};

    $.ajax({
      type:'GET', url:'/nodes/' + node, dataType: 'json', async: false,
      success: cb, error: cb});

    function cb(data, status) {
      if (status != 'success')
        return;


      data['node'] = data['node'] || node;
      NodeDialog.resourceNode = data;

      var dialog = $('#init_resources_dialog');
      var totalRAMMegs = Math.floor(data.memoryTotal/1024/1024);

      dialog.find('[name=dynamic-ram-quota]').val(ViewHelpers.ifNull(data.memoryQuota, Math.floor(totalRAMMegs * 0.80)));
      dialog.find('.ram-total-size').text(escapeHTML(totalRAMMegs) + ' MB');

      var firstResource = data.storage.hdd[0];
      var diskTotalGigs = Math.floor(firstResource.diskStats.sizeKBytes * (100 - firstResource.diskStats.usagePercent) / 100 / (1024 * 1024));
      var diskPath, diskTotal;

      diskTotal = dialog.find('.resource-row .total-size');
      function updateDiskTotal() {
        diskTotal.text(escapeHTML(diskTotalGigs) + ' GB');
      }
      updateDiskTotal();
      (diskPath = dialog.find('.resource-row [name=path]')).val(escapeHTML(firstResource.path));

      var prevPathValue;

      var hddResources = data.availableStorage.hdd;
      var mountPoints = new MountPoints(data, _.pluck(hddResources, 'path'));

      self.resourcesObserver = dialog.observePotentialChanges(function () {
        var pathValue = diskPath.val();

        if (pathValue == prevPathValue)
          return;

        prevPathValue = pathValue;
        if (pathValue == "") {
          diskTotalGigs = 0;
          updateDiskTotal();
          return;
        }

        var rv = mountPoints.lookup(pathValue);
        var pathResource = ((rv != null) && hddResources[rv]);

        if (!pathResource)
          pathResource = {path:"/", sizeKBytes: 0, usagePercent: 0};

        diskTotalGigs = Math.floor(pathResource.sizeKBytes * (100 - pathResource.usagePercent) / 100 / (1024 * 1024));
        updateDiskTotal();
      });
    }
  },
  submitResources: function () {
    if (this.resourcesObserver) {
      this.resourcesObserver.stopObserving();
      this.resourcesObserver = null;
    }

    var quota = $('#init_resources_form input[name=dynamic-ram-quota]').val();
    var diskPath = $('#init_resources_form input[name=path]').val();

    $('#init_resources_errors_container').html('');

    postWithValidationErrors('/nodes/self/controller/settings',
                             $.param({memoryQuota: quota, path: diskPath}),
                             continuation,
                             {async: false});

    function continuation(data, textStatus) {
      if (textStatus == 'error') {
        renderTemplate('init_resources_errors', data);
        $('#init_resources_form input[name=dynamic-ram-quota]')[0].focus();
        return;
      }
      showInitDialog('cluster');
    }
  },
  startPage_secure: function(node, pagePrefix, opt) {
    var parentName = '#' + pagePrefix + '_dialog';

    var form = $(parentName + ' form').unbind('submit');
    _.defer(function () {
      $(parentName).find('[name=password]')[0].focus();
    });
    form.submit(function (e) {
      e.preventDefault();

      var parent = $(parentName)

      var user = parent.find('[name=username]').val();
      var pw = parent.find('[name=password]').val();
      var vpw = parent.find('[id=secure-password-verify]').val();
      if (pw == null || pw == "") {
        genericDialog({
          header: 'Please try again',
          text: 'Empty password is not allowed',
          buttons: {cancel: false, ok: true}
        });
        return;
      }
      if (pw !== vpw) {
        genericDialog({
          header: 'Please try again',
          text: 'Password and Verify Password do not match',
          buttons: {cancel: false, ok: true}
        });
        return;
      }

      SettingsSection.processSave(this, function (dialog) {
        DAO.login = user;
        DAO.password = pw;
        DAO.setAuthCookie(user, pw);
        showInitDialog('secure');

        if (user != null && user != "") {
          $('.sign-out-link').show();
        }

        dialog.close();
      });
    });
  },
  startPage_cluster: function () {
    _.defer(function () {
      if ($('#join-cluster')[0].checked)
        $('.login-credentials').show();
    });
  }
};

NodeDialog.startPage_welcome = NodeDialog.startPage_license;

function displayNotice(text, isError) {
  var div = $('<div></div>');
  var tname = 'notice';
  if (isError || (isError === undefined && text.indexOf('error') >= 0)) {
    tname = 'noticeErr';
  }
  renderTemplate(tname, {text: text}, div.get(0));
  $.data(div.children()[0], 'notice-text', text);
  $('#notice_container').prepend(div.children());
  ThePage.gotoSection("overview");
}

$('.notice').live('click', function () {
  $(this).fadeOut('fast');
});

$('.tooltip').live('click', function (e) {
  e.preventDefault();

  var jq = $(this);
  if (jq.hasClass('active_tooltip')) {
    return;
  }

  jq.addClass('active_tooltip');
  var msg = jq.find('.tooltip_msg')
  msg.hide().fadeIn('slow', function () {this.removeAttribute('style')});

  function resetEffects() {
    msg.stop();
    msg.removeAttr('style');
    if (timeout) {
      clearTimeout(timeout);
      timeout = undefined;
    }
  }

  function hide() {
    resetEffects();

    jq.removeClass('active_tooltip');
    jq.unbind();
  }

  var timeout;

  jq.bind('click', function (e) {
    e.stopPropagation();
    hide();
  })
  jq.bind('mouseout', function (e) {
    timeout = setTimeout(function () {
      msg.fadeOut('slow', function () {
        hide();
      });
    }, 250);
  })
  jq.bind('mouseover', function (e) {
    resetEffects();
  })
});

watchHashParamLinks('sec', function (e, href) {
  ThePage.gotoSection(href);
});

