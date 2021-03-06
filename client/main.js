FlashMessages.configure({
    autoHide: true,
    autoScroll: false
});

Tracker.autorun(function roomstate() {
    if (!Session.get("view"))
        Session.set("view", "startmenu");

    var rid = Session.get("rid");
    var pid = Session.get("pid");

    if (!rid || !pid)
        return;

    var room = Rooms.findOne(rid);
    var player = Players.findOne(pid);

    if (!room || !player) {
        Session.set("rid", null);
        Session.set("pid", null);
        Session.set("view", "startmenu");
        return;
    }

    Session.set("view", {
        "lobby": "lobby",
        "seating": "seating",
        "ongoing": "game",
        "gameover": "gameover"
    }[room.state] || null);
});

Template.main.helpers({
    view: function() {
        return Session.get("view");
    }
});

Template.startmenu.events({
    "click #newgame-btn": function() {
        Session.set("view", "newgame");
    },
    "click #joingame-btn": function() {
        Session.set("view", "joingame");
    }
});

Template.newgame.events({
    "click .back-btn": function() {
        Session.set("view", "startmenu");
    },
    "submit #newgame-form": function(event) {
        var name = event.target.name.value;
        if (!name)
            return false;

        Meteor.call("newgame", {
            name: name
        }, (err, res) => {
            if (err)
                console.error(err);
            [rid, pid, code] = res;
            Meteor.subscribe("rooms", code);
            Meteor.subscribe("players", rid, function() {
                Session.set("rid", rid);
                Session.set("pid", pid);
                Session.set("view", "lobby");
            });
        });
        return false;
    }
});

Template.joingame.events({
    "click .back-btn": function() {
        Session.set("view", "startmenu");
    },
    "submit #joingame-form": function() {
        var code = event.target.code.value;
        var name = event.target.name.value;
        if (!name)
            return false;

        code = code.trim().toLowerCase();
        Meteor.subscribe("rooms", code, function() {
            var room = Rooms.findOne({
                accessCode: code
            });
            if (!room)
                return FlashMessages.sendError("Invalid access code.");
            if (room.state !== "lobby")
                return FlashMessages.sendError("Game has already started!");
            if (Players.find({
                    rid: room._id,
                    name: name
                }).count() > 0)
                return FlashMessages.sendError("Someone already took that name!");
            Meteor.subscribe("players", room._id);
            Meteor.call("joingame", {
                name: name,
                rid: room._id
            }, (err, res) => {
                if (err)
                    console.error(err);
                [rid, pid] = res;
                Session.set("rid", rid);
                Session.set("pid", pid);
                Session.set("view", "lobby");
            });
        });
        return false;
    }
});

Template.joingame.rendered = function() {
    var code = Session.get("code");
    if (code) {
        $("input[name=code]").val(code);
    }
}

Template.lobby.events({
    "click .remove-btn": function(event) {
        var pid = $(event.currentTarget).data("pid");
        Meteor.call("leavegame", {
            pid: pid
        })
    },
    "click #start-btn": function() {
        var rid = Session.get("rid");
        Meteor.call("startgame", {
            rid: rid
        });
    },
    "click #quit-btn": function() {
        var pid = Session.get("pid");
        Meteor.call("leavegame", {
            pid: pid
        }, (err) => {
            if (err)
                console.error(err);
            Session.set("rid", null);
            Session.set("pid", null);
            Session.set("view", "startmenu");
        });
    }
});

Template.lobby.helpers({
    room: function() {
        var rid;
        if (rid = Session.get("rid")) {
            return Rooms.findOne(rid);
        }
    },
    players: function() {
        var pid = Session.get("pid");
        var rid = Session.get("rid");
        var room = Rooms.findOne(rid);
        if (!room)
            return null;
        return Players.find({
            rid: rid
        }).fetch().map(function(player) {
            player.current = player._id == pid;
            return player;
        });
    },
    owner: function() {
        var pid = Session.get("pid");
        var rid = Session.get("rid");
        var room = Rooms.findOne(rid);
        return pid == room.owner;
    },
    ready: function(players) {
        var attributes = {};
        if (players.length < 5) {
            attributes.disabled = false;
        }
        return attributes;
    },
});

Template.seating.events({
    "click #ready-btn": function() {
        Meteor.call("ready", {
            pid: pid
        }, (err) => {
            if (err)
                console.error(err);
        });
    }
});

Template.seating.helpers({
    equals: function(a, b) {
        return a == b;
    },
    player: function() {
        var pid = Session.get("pid");
        var player = Players.findOne(pid);
        return player;
    },
    canready: function() {
        var attributes = {};
        var pid = Session.get("pid");
        var player = Players.findOne(pid);
        var room = Rooms.findOne(player.rid);
        if (room.players.filter(function(player) {
                return player.pid == pid;
            }).length > 0) {
            attributes["disabled"] = true;
        }
        return attributes;
    },
    role: function() {
        var pid = Session.get("pid");
        var player = Players.findOne(pid);
        return player.role;
    },
    players: function() {
        var rid = Session.get("rid");
        var room = Rooms.findOne(rid);
        return room.players;
    },
    teammates: function() {
        var pid = Session.get("pid");
        var player = Players.findOne(pid);
        var room = Rooms.findOne(player.rid);
        if (player.role == "liberal")
            return false;
        if (player.role == "hitler" && (room.size >= 7 && room.size <= 10))
            return false;
        return room.teamfascist;
    }
});

Template.game.events({
    "click ul.ring > li": function(event) {
        var pid = $(event.currentTarget).data("pid");
        var current_pid = Session.get("pid");
        var rid = Session.get("rid");
        var room = Rooms.findOne(rid);
        if (room.players[room.current_president].pid == current_pid) {
            if (room.current_chancellor == -1) {
                Meteor.call("pickchancellor", {
                    pid: pid
                });
            }
        }
    },
    "click #voteyes-btn": function() {
        var pid = Session.get("pid");
        Meteor.call("vote", {
            pid: pid,
            vote: true
        });
    },
    "click #voteno-btn": function() {
        var pid = Session.get("pid");
        Meteor.call("vote", {
            pid: pid,
            vote: false
        });
    },
    "click #fail-continue-btn": function() {
        var pid = Session.get("pid");
        Meteor.call("failcontinue", {
            pid: pid,
            vote: false
        });
    },
    "click #pick-fascist-btn": function() {
        var pid = Session.get("pid");
        Meteor.call("discard", {
            pid: pid,
            card: "fascist"
        });
    },
    "click #pick-liberal-btn": function() {
        var pid = Session.get("pid");
        Meteor.call("discard", {
            pid: pid,
            card: "liberal"
        });
    }
});

Template.game.helpers({
    equals: function(a, b) {
        return a == b;
    },
    round: function() {
        var room = Rooms.findOne(rid);
        return room.round;
    },
    room: function() {
        var rid = Session.get("rid");
        var room = Rooms.findOne(rid);
        return room;
    },
    players: function() {
        var rid = Session.get("rid");
        var room = Rooms.findOne(rid);
        return room.players;
    },
    playercircle: function(pid) {
        var current_pid = Session.get("pid");
        var rid = Session.get("rid");
        var room = Rooms.findOne(rid);
        if (room.players[room.current_president].pid == pid)
            return "president";
        if (room.players[room.current_president].pid == current_pid && room.current_chancellor == -1 && !_.contains(room.ruledout, pid))
            return "chancellor-candidate";
        if (room.current_chancellor > -1 && room.players[room.current_chancellor].pid == pid)
            return "chancellor";
    },
    picking: function() {
        var rid = Session.get("rid");
        var room = Rooms.findOne(rid);
        return room.current_chancellor == -1;
    },
    voting: function() {
        var pid = Session.get("pid");
        var rid = Session.get("rid");
        var room = Rooms.findOne(rid);
        return room.current_president > -1 && room.current_chancellor > -1 && !room.voted;
    },
    haventvoted: function() {
        var pid = Session.get("pid");
        var rid = Session.get("rid");
        var room = Rooms.findOne(rid);
        return !(pid in room.votes);
    },
    votecount: function() {
        var rid = Session.get("rid");
        var room = Rooms.findOne(rid);
        return _.size(room.votes);
    },
    votesleft: function() {
        var rid = Session.get("rid");
        var room = Rooms.findOne(rid);
        return _.size(room.players) - _.size(room.votes);
    },
    votepassed: function() {
        var rid = Session.get("rid");
        var room = Rooms.findOne(rid);
        return room.voteresult == 1;
    },
    votefailed: function() {
        var rid = Session.get("rid");
        var room = Rooms.findOne(rid);
        return room.voteresult == -1;
    },
    president: function() {
        var pid = Session.get("pid");
        var rid = Session.get("rid");
        var room = Rooms.findOne(rid);
        return room.players[room.current_president].pid == pid;
    },
    chancellor: function() {
        var pid = Session.get("pid");
        var rid = Session.get("rid");
        var room = Rooms.findOne(rid);
        return room.players[room.current_chancellor].pid == pid;
    },
    plural: function(obj) {
        return obj != 1;
    }
});

Template.gameover.helpers({
    room: function() {
        var rid = Session.get("rid");
        var room = Rooms.findOne(rid);
        return room;
    },
    players: function() {
        var rid = Session.get("rid");
        var room = Rooms.findOne(rid);
        return room.players;
    },
});