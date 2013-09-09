//
//  Author: Vlad Seryakov vseryakov@gmail.com
//  May 2012
//

var ew_ASGroupsTreeView = {
    model: [ "asgroups", "asconfigs", "asnotifications", "subnets", "availabilityZones", "loadBalancers", "topics", 'placementGroups'],

    suspendProcesses: function(resume)
    {
        var me = this;
        var item = this.getSelected();
        if (!item) return;

        var procs = [];
        if (resume) {
            item.suspendedProcesses.forEach(function(x) { procs.push(x.name); });
        } else {
            procs = ['Launch','Terminate','HealthCheck','ReplaceUnhealthy','AZRebalance','AlarmNotification','ScheduledActions','AddToLoadBalancer'];
        }

        var values = this.core.promptInput((resume ? "Resume" : "Suspend") + " Auto Scaling Processes",
                                [{label:"AutoScaling Group",type:"label",value:item.name},
                                 {label:"Process Types",type:"listview",list:procs}]);
        if (!values) return;
        if (resume) {
            this.api.resumeProcesses(item.name, values[1], function() { me.refresh(); });
        } else {
            this.api.suspendProcesses(item.name, values[1], function() { me.refresh(); });
        }
    },

    putNotifications: function()
    {
        var me = this;
        var item = this.getSelected();
        if (!item) return;

        var checked = [];
        this.core.queryModel('asnotifications', 'group', item.name).forEach(function(x) { checked.push(x.type); });

        var values = this.core.promptInput("Set Notifications",
                            [{label:"AutoScaling Group",type:"label",value:item.name},
                             {label:"SNS Topic",type:"menulist",list:this.core.queryModel('topics'),required:1},
                             {label:"Notifications",type:"listview",list:['autoscaling:EC2_INSTANCE_LAUNCH',
                                                                          'autoscaling:EC2_INSTANCE_LAUNCH_ERROR',
                                                                          'autoscaling:EC2_INSTANCE_TERMINATE',
                                                                          'autoscaling:EC2_INSTANCE_TERMINATE_ERROR',
                                                                          'autoscaling:TEST_NOTIFICATION'], checkedItems:checked}]);
        if (!values) return;
        this.api.putNotificationConfiguration(item.name, values[1], values[2], function() { me.core.refreshModel('asnotifications'); });
    },

    putGroup: function(edit)
    {
        var me = this;
        var item = this.getSelected();

        if (!edit && this.core.queryModel('asconfigs').length < 1) {
            alert("One or more autoscaling launch configurations must be\navailable before an autoscaling group can be added.");
            return;
        }

        var inputs = [{label:"Name",required:1,tooltiptext:"The Auto Scaling group name must be unique within the scope of your AWS account, and under the quota of Auto Scaling groups allowed for your account."},
                      {label:"Availability Zones",type:"listview",rows:3,list:this.core.queryModel('availabilityZones'),required:1,tooltiptext:"A list of Availability Zones for the Auto Scaling group. This is required unless you have specified subnets."},
                      {label:"Launch Configuration",type:"menulist",list:this.core.queryModel('asconfigs'),key:"name",required:1,tooltiptext:"The name of the launch configuration to use with the Auto Scaling group."},
                      {label:"Min Size",type:"number",required:1,tooltiptext:"The minimum size of the Auto Scaling group."},
                      {label:"Max Size",type:"number",required:1,tooltiptext:"The maximum size of the Auto Scaling group."},
                      {label:"Desired Capacity",type:"number",tooltiptext:"The number of Amazon EC2 instances that should be running in the group."},
                      {label:"Default Cooldown",type:"number",tooltiptext:"The amount of time, in seconds, after a scaling activity completes before any further trigger-related scaling activities can start."},
                      {label:"Health Check Type",type:"menulist",list:["EC2","ELB"],tooltiptext:"The service you want the health status from, Amazon EC2 or Elastic Load Balancer. Valid values are EC2 or ELB."},
                      {label:"Health Check Grace Period",type:"number",tooltiptext:"Length of time in seconds after a new Amazon EC2 instance comes into service that Auto Scaling starts checking its health."},
                      {label:"VPC Subnets",type:"listview",rows:5,list:this.core.queryModel('subnets')},
                      {label:"Load Balancers",type:"listview",rows:3,list:this.core.queryModel('loadBalancers'),tooltiptext:"A list of load balancers to use. "},
                      {label:"Placement Group",type:"menulist",list:this.core.queryModel('placementGroups'),key:"name",tooltiptext:"Physical location of your cluster placement group created in Amazon EC2."},
                      {label:"Termination Policy",type:"listview",list:["OldestInstance","NewestInstance","OldestLaunchConfiguration","ClosestToNextInstanceHour","Default"],rows:5,tooltiptext:"A standalone termination policy or a list of termination policies used to select the instance to terminate. The policies are executed in the order that they are listed."},
                      {label:"Tag",multiline:true,rows:2,tooltiptext:"Tags to propagate to the instances, one tag in the form key:value per line"},
                      {label:"Propagate Tags",type: "checkbox", value: true,tooltiptext:"Whether or not to propagate tags on launch"},
                      {label:"Enable Metrics Collection",type: "checkbox", value: true,tooltiptext:"Enable CloudWatch metrics for this ASG"},
                      ];

        if (edit) {
            if (!item) return;
            inputs[0].value = item.name;
            inputs[0].readonly = true;
            inputs[1].checkedItems = [];
            item.availabilityZones.forEach(function(x) { inputs[1].checkedItems.push(me.core.findModel('availabilityZones',x)); });
            inputs[2].value = item.launchConfiguration;
            inputs[3].value = item.minSize;
            inputs[4].value = item.maxSize;
            inputs[5].value = item.capacity;
            inputs[6].value = item.defaultCooldown;
            inputs[7].value = item.healthCheckType;
            inputs[8].value = item.healthCheckGracePeriod;
            inputs[9].checkedItems = [];
            item.vpcZone.split(",").forEach(function(x) { inputs[9].checkedItems.push(me.core.findModel('subnets',x)); });
            inputs[10].checkedItems = item.loadBalancers;
            inputs[11].value = item.placementGroup;
            inputs[12].checkedItems = item.terminationPolicies;
            inputs[13].value = item.tags.join("\n");
            inputs[14].value = item.tags.join("\n");
        }

        var values = this.core.promptInput((edit ? 'Edit' : 'Create') + ' AutoScaling Group', inputs);
        if (!values) return;

        var tags = this.core.parseTags(values[13]);
        var propagate = false;
        if (values[14]){
            propagate = true;
        }
        if (edit) {
            // Disable monitoring when updating live group
            var cfg = this.core.findModel('asconfigs', item.launchConfiguration, 'name');
            function doEdit() {
                me.core.api.updateAutoScalingGroup(values[0], values[1], values[2], values[3], values[4], values[5], values[6], values[7], values[8], values[9], values[10], values[11], values[12], tags, propagate, function() {
                    if (cfg.monitoring) {
                        me.core.api.enableMetricsCollection(item.name, function() { me.refresh(); });
                    } else {
                        me.refresh();
                    }
                });
            }
            if (cfg.monitoring) {
                me.core.api.disableMetricsCollection(item.name, function() { doEdit(); });
            } else {
                doEdit();
            }
        } else {
            this.core.api.createAutoScalingGroup(values[0], values[1], values[2], values[3], values[4], values[5], values[6], values[7], values[8], values[9], values[10], values[11], values[12], tags, propagate, function() { me.refresh(); });
        }
    },

    setCapacity : function ()
    {
        var me = this;
        var item = this.getSelected();
        if (!item) return;
        var check = {value: false};
        var n = this.core.promptData("Set Desired Capacity", "Set new capacity for " + item.name + "?", item.capacity, "Honor Cooldown", check);
        if (!n) return;
        this.core.api.setDesiredCapacity(item.name, n, check.value, function() { me.refresh(); });
    },

    enableMetrics: function()
    {
        var item = this.getSelected();
        if (!item) return;
        this.core.api.enableMetricsCollection(item.name, function() { ew_ASConfigsTreeView.refresh(); });

    },

    disableMetrics: function()
    {
        var item = this.getSelected();
        if (!item) return;
        this.core.api.disableMetricsCollection(item.name, function() { ew_ASConfigsTreeView.refresh(); });

    },

    deleteSelected : function()
    {
        var me = this;
        var item = this.getSelected();
        if (!item) return;
        var check = {value: false};
        if (!this.core.promptConfirm("Delete AutoScaling Group", "Delete " + item.name + "?", "Force Delete", check)) return;
        this.core.api.deleteAutoScalingGroup(item.name, check.value, function() { me.refresh(); });
    },

};

var ew_ASConfigsTreeView = {
    model: ["asconfigs", "asgroups", "snapshots", "images", "instanceProfiles", "keypairs", "securityGroups"],

    addConfig: function()
    {
        var me = this;
        function callback(idx, onstart) {
            var item = this.rc.items[idx];
            switch (idx) {
            case 2:
                var images = me.core.getImagesByType(me.core.getModel('images'), item.obj.value);
                var amiList = this.rc.items[idx+1].obj;
                amiList.removeAllItems();
                for (var i in images) {
                    amiList.appendItem(images[i].toString(), images[i].id);
                }
                amiList.selectedIndex = 0;
                break;
            }
        }

        var values = this.core.promptInput("Create Launch Configuration",
                [{label:"Name",required:1},
                 {label:"InstanceType",type:"menulist",list:this.core.getInstanceTypes(),required:1,style:"max-width:500px",tooltiptext:"The instance type of the Amazon EC2 instance."},
                 {label:"Images",type:"menulist",list:this.core.getImageFilters(),key:"value",required:1},
                 {label:"Instance Image",type:"menulist",list:[],required:1,style:"max-width:500px"},
                 {label:"EBS Optimized",type:"checkbox",tooltiptext:"Whether the instance is optimized for EBS I/O. This optimization provides dedicated throughput to Amazon EBS and an optimized configuration stack to provide optimal EBS I/O performance. This optimization is not available with all instance types. Additional usage charges apply when using an EBS Optimized instance."},
                 {label:"KernelId",tooltiptext:"The ID of the kernel associated with the Amazon EC2 AMI."},
                 {label:"RamdiskId",tooltiptext:"The ID of the RAM disk associated with the Amazon EC2 AMI."},
                 {label:"IAM Instance Profile",type:"menulist",list:this.core.queryModel("instanceProfiles"),key:'name',tooltiptext:"The name or the Amazon Resource Name (ARN) of the instance profile associated with the IAM role for the instance. "},
                 {label:"Keypair Name",type:"menulist",list:this.core.queryModel("keypairs"),key:'name'},
                 {label:"Spot Instance Price",type:"number",tooltiptext:"The maximum hourly price to be paid for any Spot Instance launched to fulfill the request. Spot Instances are launched when the price you specify exceeds the current Spot market price."},
                 {label:"User Data",multiline:true,cols:40,rows:3,tooltiptext:"User data to be made available to the instance."},
                 {label:"Monitoring",type:"checkbox",tooltiptext:"Enables detailed monitoring, which is enabled by default. When detailed monitoring is enabled, CloudWatch will generate metrics every minute and your account will be charged a fee. When you disable detailed monitoring, by specifying False, Cloudwatch will generate metrics every 5 minutes."},
                 {label:"Security Groups",type:"listview",list:this.core.queryModel('securityGroups'),flex:1,rows:5,tooltiptext:"The names of the security groups with which to associate Amazon EC2 or Amazon VPC instances. Specify Amazon EC2 security groups using security group names, such as websrv. Specify Amazon VPC security groups using security group IDs, such as sg-12345678.Cannot combine VPC and non-VPC security groups."}
                 ], { onchange: callback });
        if (!values) return;
        this.core.api.createLaunchConfiguration(values[0],values[1],values[3],values[4],values[5],values[6],values[7],values[8],values[9],values[10],values[11],values[12],function() { me.refresh(); });
    },

    deleteSelected : function ()
    {
        var me = this;
        if (!TreeView.deleteSelected.call(this)) return;
        var item = this.getSelected();
        this.core.api.deleteLaunchConfiguration(item.name, function() { me.refresh(); });
    },

};

var ew_ASPoliciesTreeView = {
    model: ["aspolicies", "asgroups"],

    putPolicy: function(edit)
    {
        var me = this;
        var item = this.getSelected();
        function onchange(idx) {
            var item = this.rc.items[idx];
            switch (idx) {
            case 2:
                this.rc.items[4].obj.disabled = item.obj.value != 'PercentChangeInCapacity';
                if (this.rc.items[4].obj.disabled) this.rc.items[idx+1].obj.value = 0;
                break;
            }
        };
        var inputs = [{label:"Name",required:1},
                      {label:"AutoScaling Group",type:"menulist",list:this.core.queryModel('asgroups'),key:'name',required:1},
                      {label:"Adjustment Type",type:"menulist",list:["ChangeInCapacity","ExactCapacity","PercentChangeInCapacity"],required:1,tooltiptext:"Specifies whether the ScalingAdjustment is an absolute number or a percentage of the current capacity."},
                      {label:"Scaling Adjustment",type:"number",required:1,min:-99999,tooltiptext:"The number of instances by which to scale. AdjustmentType determines the interpretation of this number (e.g., as an absolute number or as a percentage of the existing Auto Scaling group size). A positive increment adds to the current capacity and a negative value removes from the current capacity."},
                      {label:"Min Adjustment Step",type:"number",tooltiptext:"Used with AdjustmentType with the value PercentChangeInCapacity, the scaling policy changes the DesiredCapacity of the Auto Scaling group by at least the number of instances specified in the value.You will get a ValidationError if you use MinAdjustmentStep on a policy with an AdjustmentType other than PercentChangeInCapacity."},
                      {label:"Cooldown",type:"number",tooltiptext:"The amount of time, in seconds, after a scaling activity completes before any further trigger-related scaling activities can start."},
                      ];

        if (edit) {
            if (!item) return;
            inputs[0].value = item.name;
            inputs[0].readonly = true;
            inputs[1].value = item.group;
            inputs[2].value = item.adjustmentType;
            inputs[3].value = item.scalingAdjustment;
            inputs[4].value = item.minAdjustmentStep;
            inputs[5].value = item.cooldown;
        }
        var values = this.core.promptInput((edit ? "Edit" : "Create") + ' AutoScaling Policy', inputs, { onchange: onchange});
        if (!values) return;
        this.core.api.putScalingPolicy(values[0],values[1],values[2],values[3],values[4],values[5], function() { me.refresh(); });
    },

    deleteSelected : function ()
    {
        var me = this;
        if (!TreeView.deleteSelected.call(this)) return;
        var item = this.getSelected();
        this.core.api.deletePolicy(item.group, item.name, function() { me.refresh(); });
    },

    execPolicy : function ()
    {
        var me = this;
        var item = this.getSelected();
        if (!item) return;
        var check = {value: false};
        if (!this.core.promptConfirm("Exec AutoScaling Policy", "Execute policy " + item.name + "?", "Reject if in cooldown", check)) return;
        this.core.api.executePolicy(item.group, item.name, check.value, function() { me.refresh(); });
    },


};

var ew_ASActionsTreeView = {
    model: ["asactions", "asgroups"],

    putAction: function(edit)
    {
        var me = this;
        var item = this.getSelected();

        var inputs = [ {label:"Action Name",required:1},
                       {label:"AutoScaling Group",type:"menulist",list:this.core.queryModel('asgroups'),key:'name',required:1},
                       {label:"Desired Capacity",type:"number",tooltiptext:"The number of Amazon EC2 instances that should be running in the group."},
                       {label:"Recurrence",tooltiptext:"Cron format, * * * * * where 1st is day of week (0 - 6) (0 is Sunday, or use names), 2nd is month (1 - 12), 3rd is day of month (1 - 31), 4th is hour (0 - 23), 5th is minute (0 - 59)"},
                       {label:"Start Time",tooltiptext:"The time for this action to start as in 2010-06-01T00:00:00Z. When StartTime and EndTime are specified with Recurrence, they form the boundaries of when the recurring action will start and stop."},
                       {label:"End Time",tooltiptext:"The time for this action to end as in 2010-06-01T00:00:00Z. When StartTime and EndTime are specified with Recurrence, they form the boundaries of when the recurring action will start and stop."},
                       {label:"Min Size",type:"number"},
                       {label:"Max Size",type:"number"}];

        if (edit) {
            if (!item) return;
            inputs[0].value = item.name;
            inputs[0].readonly = true;
            inputs[1].value = item.group;
            inputs[2].value = item.capacity;
            inputs[3].value = item.recurrence;
            inputs[4].value = isNaN(item.start) ? "" : item.start.toISOString();
            inputs[5].value = isNaN(item.end) ? "" : item.end.toISOString();
            inputs[6].value = item.minSize;
            inputs[7].value = item.maxSize;
        }

        var values = this.core.promptInput((edit ? " Edit" : "Create") + " Scheduled Action", inputs);
        if (!values) return;
        this.core.api.putScheduledUpdateGroupAction(values[0],values[1],values[2],values[3],values[4],values[5],values[6],values[7], function() { me.refresh(); });
    },

    deleteSelected : function ()
    {
        var me = this;
        if (!TreeView.deleteSelected.call(this)) return;
        var item = this.getSelected();
        this.core.api.deleteScheduledAction(item.group, item.name, function() { me.refresh(); });
    },

};

var ew_ASInstancesTreeView = {
   model: ["asinstances", "asconfigs", "asgroups", "instances"],

   setHealth : function ()
   {
       var me = this;
       var item = this.getSelected();
       if (!item) return;
       var check = {value: false};
       var status = (item.healthStatus.toUpperCase() == "HEALTHY") ? "Unhealthy" : "Healthy";
       if (!this.core.promptConfirm("Set Health Status", "Set status to " + status + " for " + item.instanceId + "?", "Respect Grace Period", check)) return;
       this.core.api.setInstanceHealth(item.instanceId, status, check.value, function() { me.refresh(); });
   },

   terminate : function ()
   {
       var me = this;
       var item = this.getSelected();
       if (!item) return;
       var check = {value: false};
       if (!this.core.promptConfirm("Terminate Instance", "Terminate instance " + item.instanceId + "?", "Decrement desired capacity", check)) return;
       this.core.api.terminateInstanceInAutoScalingGroup(item.instanceId, check.value, function() { me.refresh(); });
   },

};

var ew_ASActivitiesTreeView = {
   model: ["asactivities"],
};
