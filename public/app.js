(function () {
  var stay = null;
  var fixtures = [];
  var current = null;
  var proposal = null;
  var verdict = null;
  var memory = null;
  var thread = [];
  var walkTimer = null;
  var stageOrder = [];
  var keyed = false;
  var modelName = "";
  var trace = [];
  var proposalSrc = "";
  var proposing = false;
  var walking = false;
  var idle = true;
  var INTRO =
    "A normal question, a refund the agent cannot pay, a host who can, then a slot that disappears.";
  var OVERRIDE_CAPTION =
    "The host overrides. Money moves. The agent still could not have done this.";

  var STORY = {
    "guest-eval-1-act": {
      caption:
        "Moment 1 of 3 — Before check-in. Alex asks a normal question. The agent should answer from the house manual."
    },
    "guest-eval-2-escalate": {
      caption:
        "Moment 2 of 3 — During the stay. Alex wants a full refund. The agent will try to pay. Policy must stop it."
    },
    "guest-eval-3-stop": {
      caption:
        "Moment 3 of 3 — The calendar takes back 13:00. The agent must not say it is confirmed."
    }
  };

  var STAGE_LABEL = {
    inquiry: "Asked",
    booked: "Booked",
    pre_arrival: "Before arrival",
    in_stay: "In stay",
    checkout: "Checkout",
    closed: "Closed"
  };

  function $(id) {
    return document.getElementById(id);
  }

  function text(el, value) {
    el.textContent = value == null ? "" : String(value);
  }

  function fillDl(dl, rows) {
    dl.replaceChildren();
    rows.forEach(function (row) {
      var dt = document.createElement("dt");
      text(dt, row[0]);
      var dd = document.createElement("dd");
      text(dd, row[1]);
      dl.appendChild(dt);
      dl.appendChild(dd);
    });
  }

  function fillList(ul, items) {
    ul.replaceChildren();
    (items || []).forEach(function (item) {
      var li = document.createElement("li");
      text(li, typeof item === "string" ? item : JSON.stringify(item));
      ul.appendChild(li);
    });
  }

  function setCallClass(el, call) {
    el.className = "call call-" + call;
    text(el, call);
  }

  function stageIndex(name) {
    return stageOrder.indexOf(name);
  }

  function renderStages(active) {
    var ol = $("stages");
    ol.replaceChildren();
    var activeIdx = stageIndex(active);
    stageOrder.forEach(function (name, idx) {
      var li = document.createElement("li");
      text(li, STAGE_LABEL[name] || name.replace(/_/g, " "));
      if (name === active) li.classList.add("on");
      else if (idx < activeIdx) li.classList.add("done");
      ol.appendChild(li);
    });
  }

  function renderThread() {
    var box = $("thread");
    box.replaceChildren();
    thread.forEach(function (msg) {
      var div = document.createElement("div");
      div.className = "bubble " + msg.role;
      var who = document.createElement("span");
      who.className = "who";
      text(
        who,
        msg.role === "guest"
          ? "Guest"
          : msg.role === "agent"
            ? "Agent"
            : msg.role === "host"
              ? "Host"
              : "System"
      );
      var body = document.createElement("div");
      text(body, msg.text);
      div.appendChild(who);
      div.appendChild(body);
      box.appendChild(div);
    });
    box.scrollTop = box.scrollHeight;
  }

  function render() {
    if (!stay || !current) return;
    var s = stay.stay;
    fillDl($("stay-dl"), [
      ["Booking", s.booking_id + " v" + (memory.stay_version || s.version)],
      ["Listing", s.listing],
      ["Channel", s.channel + " · thread " + (memory.channel_thread_id || "")],
      ["Dates", s.check_in + " → " + s.check_out + " · " + s.guests + " guests"],
      ["Guest", stay.guest.name + " · " + stay.guest.locale],
      ["Stage", current.stage || s.stage]
    ]);
    var story = STORY[current.id];
    if (idle) text($("caption"), INTRO);
    else if (verdict && verdict.call === "override") text($("caption"), OVERRIDE_CAPTION);
    else if (story) text($("caption"), story.caption);
    text(
      $("stay-line"),
      s.listing +
        " · " +
        stay.guest.name +
        " · " +
        s.check_in +
        " → " +
        s.check_out +
        " · " +
        (STAGE_LABEL[current.stage || s.stage] || current.stage || s.stage)
    );

    var wanted = "Waiting.";
    if (proposal) {
      var opt = current.options.find(function (o) {
        return o.id === proposal.option_id;
      });
      wanted = opt ? opt.summary : "Option " + proposal.option_id;
    }
    text($("wanted-text"), wanted);

    var badge = $("happened-badge");
    var happened = "Press Play.";
    if (!verdict) {
      setCallClass(badge, "idle");
      text(badge, "idle");
      text($("guest-hears"), "Nothing yet.");
    } else if (verdict.call === "act" && verdict.ticket) {
      setCallClass(badge, "act");
      text(badge, "Allowed");
      happened = "Answered from the stay. No human needed.";
      text($("guest-hears"), verdict.guest_reply || "Replied.");
    } else if (verdict.call === "override") {
      setCallClass(badge, "override");
      text(badge, "Host override");
      happened = "Host approved the refund. The agent still could not.";
      text($("guest-hears"), verdict.guest_reply || "Host refunded.");
    } else if (verdict.call === "escalate") {
      setCallClass(badge, "escalate");
      text(badge, "Ask a human");
      happened = "Did not move money. A host owns this.";
      text(
        $("guest-hears"),
        verdict.guest_reply || "Nothing promised. Host queue opened."
      );
    } else {
      setCallClass(badge, "stop");
      text(badge, "Stopped");
      happened = "Did not confirm. Did not send a door code.";
      text($("guest-hears"), "Nothing sent — the slot was gone.");
    }
    text($("happened-text"), happened);

    text($("thread-id"), memory.channel_thread_id || "");
    text($("memory-persist"), JSON.stringify(memory, null, 2));
    fillList($("memory-discard"), stay.memory_discard);
    renderStages(current.stage || s.stage);
    text($("eval-title"), current.title);
    fillList(
      $("options"),
      current.options.map(function (o) {
        return (
          o.id +
          " · " +
          o.kind +
          " · may=" +
          o.agent_may +
          " · money=" +
          !!o.moves_money +
          " · " +
          o.summary
        );
      })
    );

    if (proposal) {
      text($("proposal-id"), proposal.option_id);
      text($("proposal-src"), proposalSrc || "");
      text($("proposal-text"), proposal.rationale);
    } else {
      text($("proposal-id"), "—");
      text($("proposal-src"), "");
      text(
        $("proposal-text"),
        "Propose first. Model when keyed; greedy takes refund/withdrawn traps when present."
      );
    }
    text(
      $("trace"),
      trace.length ? JSON.stringify(trace, null, 2) : "(no tools this round)"
    );

    if (verdict) {
      setCallClass($("verdict-call"), verdict.call);
      text(
        $("verdict-ticket"),
        verdict.ticket ? "SIDE EFFECT OK" : "NO SIDE EFFECT"
      );
      $("verdict-ticket").className = verdict.ticket ? "badge ok" : "badge bad";
      text($("guest-reply"), verdict.guest_reply || "(none — hold or halt)");
      fillList($("workflows"), verdict.workflow || []);
      text($("packet"), JSON.stringify(verdict.packet, null, 2));
    } else {
      setCallClass($("verdict-call"), "idle");
      text($("verdict-ticket"), "—");
      $("verdict-ticket").className = "badge";
      text($("guest-reply"), "");
      fillList($("workflows"), []);
      text($("packet"), "");
    }

    renderThread();
  }

  function pushGuestMessage() {
    if (!current || !current.guest_message) return;
    var t = current.guest_message.text;
    var exists = thread.some(function (m) {
      return m.role === "guest" && m.text === t && m.eval === current.id;
    });
    if (!exists) {
      thread.push({ role: "guest", text: t, eval: current.id });
    }
  }

  function selectEval(id, opts) {
    opts = opts || {};
    current = fixtures.find(function (f) {
      return f.id === id;
    });
    proposal = null;
    verdict = null;
    trace = [];
    proposalSrc = "";
    document.querySelectorAll("[data-eval]").forEach(function (btn) {
      btn.classList.toggle("on", btn.getAttribute("data-eval") === id);
    });
    if (!opts.keepIdle) idle = false;
    if (!opts.silentGuest) pushGuestMessage();
    render();
  }

  function setStatus(kind, label) {
    var el = $("model-status");
    el.className = "status " + kind;
    text(el, label);
  }

  function refreshStatus() {
    return fetch("/api/status")
      .then(function (r) {
        if (!r.ok) throw new Error("status");
        return r.json();
      })
      .then(function (st) {
        keyed = !!st.keyed;
        modelName = st.model || "";
        if (keyed) setStatus("live", "live · " + modelName);
        else setStatus("fallback", "stand-in (no API key)");
        return st;
      })
      .catch(function () {
        keyed = false;
        setStatus("fallback", "stand-in (no propose server)");
      });
  }

  function proposeGreedy() {
    if (!current) return;
    proposal = GUEST_POLICY.greedyPropose(current);
    proposalSrc = "greedy";
    trace = [];
    verdict = null;
    render();
  }

  function proposePaste() {
    if (!current) return;
    var raw = $("paste").value;
    proposal = GUEST_POLICY.parseProposal(raw);
    proposalSrc = "paste";
    trace = [];
    verdict = null;
    render();
  }

  function proposeModel() {
    if (!current || proposing) return Promise.resolve();
    proposing = true;
    setStatus("busy", "model proposing…");
    var body = {
      fixture: current,
      stay: stay,
      memory: memory,
      guest_message: current.guest_message && current.guest_message.text
    };
    return fetch("/api/propose", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    })
      .then(function (r) {
        return r.json().then(function (j) {
          return { okHttp: r.ok, json: j };
        });
      })
      .then(function (pack) {
        var j = pack.json || {};
        if (j.ok && j.proposal) {
          proposal = j.proposal;
          proposalSrc = "model · " + (j.model || modelName);
          trace = j.trace || [];
          verdict = null;
          setStatus("live", "live · " + (j.model || modelName));
          render();
          return;
        }
        trace = j.trace || [];
        proposeGreedy();
        proposalSrc = "greedy (model fallback: " + (j.error || "unavailable") + ")";
        render();
        if (j.fallback || j.error === "no_api_key") {
          setStatus("fallback", "stand-in (no API key)");
        } else {
          setStatus("fallback", "stand-in · " + (j.error || "model error"));
        }
      })
      .catch(function (err) {
        proposeGreedy();
        proposalSrc = "greedy (model error)";
        setStatus("fallback", "stand-in");
        render();
        console.warn("propose", err);
      })
      .finally(function () {
        proposing = false;
      });
  }

  function proposeBest() {
    if (keyed) return proposeModel();
    proposeGreedy();
    return Promise.resolve();
  }

  function applyVeto() {
    if (!current || !proposal) return;
    verdict = GUEST_POLICY.veto(current, proposal);
    memory = GUEST_POLICY.applyMemory(
      { memory_persist: memory, stay: stay.stay },
      current,
      verdict
    );
    if (verdict.guest_reply) {
      thread.push({
        role: "agent",
        text: verdict.guest_reply,
        eval: current.id
      });
    } else if (verdict.call === "stop") {
      thread.push({
        role: "system",
        text: "Stopped. The 13:00 slot was gone. No confirmation sent.",
        eval: current.id
      });
    } else if (verdict.call === "escalate" && !verdict.guest_reply) {
      thread.push({
        role: "system",
        text: "Held. Host queue owns this. Nothing promised to the guest.",
        eval: current.id
      });
    }
    render();
  }

  function applyHostOverride() {
    if (!current || !verdict) return;
    var next = GUEST_POLICY.hostOverride(current, verdict);
    verdict = next;
    memory = GUEST_POLICY.applyMemory(
      { memory_persist: memory, stay: stay.stay },
      current,
      verdict
    );
    if (next.call === "override") {
      thread.push({
        role: "host",
        text: "Approved. Full refund for the AC failure.",
        eval: current.id
      });
      if (next.guest_reply) {
        thread.push({
          role: "agent",
          text: next.guest_reply,
          eval: current.id
        });
      }
    }
    render();
  }

  function resetAll() {
    if (walkTimer) {
      clearTimeout(walkTimer);
      walkTimer = null;
    }
    memory = JSON.parse(JSON.stringify(stay.memory_persist));
    walking = false;
    idle = true;
    text($("btn-walk"), "Play");
    thread = [
      {
        role: "system",
        text: stay.stay.listing + " · stay confirmed for " + stay.guest.name
      }
    ];
    proposal = null;
    verdict = null;
    trace = [];
    proposalSrc = "";
    selectEval("guest-eval-1-act", { silentGuest: true, keepIdle: true });
  }

  function walkMission() {
    if (walkTimer) {
      clearTimeout(walkTimer);
      walkTimer = null;
    }
    resetAll();
    idle = false;
    walking = true;
    text($("btn-walk"), "Playing…");
    var steps = [
      function () {
        selectEval("guest-eval-1-act");
        return Promise.resolve();
      },
      function () {
        return proposeBest();
      },
      function () {
        applyVeto();
        return Promise.resolve();
      },
      function () {
        selectEval("guest-eval-2-escalate");
        return Promise.resolve();
      },
      function () {
        return proposeBest();
      },
      function () {
        applyVeto();
        return Promise.resolve();
      },
      function () {
        applyHostOverride();
        return Promise.resolve();
      },
      function () {
        selectEval("guest-eval-3-stop");
        return Promise.resolve();
      },
      function () {
        return proposeBest();
      },
      function () {
        applyVeto();
        return Promise.resolve();
      },
      function () {
        text(
          $("caption"),
          "Done. Easy question allowed. Agent refund blocked. Host refund allowed. Fake confirmation stopped."
        );
        walking = false;
        text($("btn-walk"), "Play");
        return Promise.resolve();
      }
    ];
    var pauseAfter = [
      4000, 3500, 7000, 4000, 3500, 7000, 7000, 4000, 3500, 7000, 0
    ];
    var i = 0;
    function tick() {
      if (i >= steps.length) return;
      Promise.resolve(steps[i]()).then(function () {
        var wait = pauseAfter[i] || 0;
        i += 1;
        if (wait) walkTimer = setTimeout(tick, wait);
        else tick();
      });
    }
    tick();
  }

  function toggleInternals() {
    var el = $("internals");
    el.hidden = !el.hidden;
    $("btn-internals").classList.toggle("on", !el.hidden);
  }

  function load() {
    return Promise.all([
      fetch("fixtures/stay.json").then(function (r) {
        if (!r.ok) throw new Error("stay " + r.status);
        return r.json();
      }),
      fetch("fixtures/eval-1-act.json").then(function (r) {
        if (!r.ok) throw new Error("e1 " + r.status);
        return r.json();
      }),
      fetch("fixtures/eval-2-escalate.json").then(function (r) {
        if (!r.ok) throw new Error("e2 " + r.status);
        return r.json();
      }),
      fetch("fixtures/eval-3-stop.json").then(function (r) {
        if (!r.ok) throw new Error("e3 " + r.status);
        return r.json();
      })
    ]);
  }

  document.addEventListener("click", function (ev) {
    var t = ev.target;
    if (!(t instanceof HTMLElement)) return;
    var evalId = t.getAttribute("data-eval");
    if (evalId) selectEval(evalId);
    if (t.id === "btn-model") proposeModel();
    if (t.id === "btn-greedy") proposeGreedy();
    if (t.id === "btn-paste") proposePaste();
    if (t.id === "btn-veto") applyVeto();
    if (t.id === "btn-override") applyHostOverride();
    if (t.id === "btn-reset") resetAll();
    if (t.id === "btn-walk") walkMission();
    if (t.id === "btn-internals") toggleInternals();
  });

  load()
    .then(function (data) {
      stay = data[0];
      fixtures = [data[1], data[2], data[3]];
      stageOrder = stay.stages || [];
      memory = JSON.parse(JSON.stringify(stay.memory_persist));
      $("boot").hidden = true;
      $("app").hidden = false;
      resetAll();
      refreshStatus();
    })
    .catch(function (err) {
      text(
        $("boot"),
        "Serve over HTTP (local server or the live Worker). " + err.message
      );
    });
})();
