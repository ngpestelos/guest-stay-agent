(function () {
  var stay = null;
  var fixtures = [];
  var scenarios = { playlists: [] };
  var currentPlaylist = null;
  var playlistCursor = 0;
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
  var pending = null;
  var runId = 0;
  var INTRO = "Press Play. Each run is a different stay story.";
  var OVERRIDE_CAPTION =
    "The host overrides. Money moves. The agent still could not have done this.";
  var PLAYLIST_KEY = "guestStayPlaylist";
  // Intentionally public — same value as wrangler.jsonc's UI_ACT_KEY var.
  // Time-boxed (UI_ACT_KEY_EXPIRES_AT server-side); past expiry every call
  // below fails closed and this file falls back to its original
  // client-side-only propose+veto behavior automatically.
  var UI_ACT_KEY = "0d996347119e3ff4682952355a229de3";
  var actResult = null;

  function beatFor(id) {
    if (!currentPlaylist || !currentPlaylist.beats) return null;
    return currentPlaylist.beats.filter(function (b) {
      return b.id === id;
    })[0] || null;
  }

  function firstPlaylist() {
    return (scenarios.playlists && scenarios.playlists[0]) || null;
  }

  function pickNextPlaylist() {
    var list = scenarios.playlists || [];
    if (!list.length) return null;
    var stored = 0;
    try {
      stored = parseInt(sessionStorage.getItem(PLAYLIST_KEY) || "0", 10) || 0;
    } catch (e) {
      stored = playlistCursor;
    }
    var p = list[stored % list.length];
    var next = (stored + 1) % list.length;
    playlistCursor = next;
    try {
      sessionStorage.setItem(PLAYLIST_KEY, String(next));
    } catch (e2) {
      /* private mode */
    }
    return p;
  }

  function fillEvalsNav() {
    var nav = $("evals-nav");
    if (!nav) return;
    nav.replaceChildren();
    var beats = (currentPlaylist && currentPlaylist.beats) || [];
    beats.forEach(function (b) {
      var btn = document.createElement("button");
      btn.type = "button";
      btn.setAttribute("data-eval", b.id);
      text(btn, b.nav || b.id);
      if (current && current.id === b.id) btn.classList.add("on");
      nav.appendChild(btn);
    });
  }

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
      div.className = "bubble " + msg.role + (msg.pending ? " pending" : "");
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
      div.appendChild(who);
      if (msg.pending) {
        var dots = document.createElement("div");
        dots.className = "dots";
        dots.setAttribute("aria-label", "Working");
        for (var i = 0; i < 3; i++) {
          var s = document.createElement("span");
          text(s, ".");
          dots.appendChild(s);
        }
        div.appendChild(dots);
      } else {
        var body = document.createElement("div");
        text(body, msg.text);
        div.appendChild(body);
      }
      box.appendChild(div);
    });
    box.scrollTop = box.scrollHeight;
  }

  function clearPending() {
    pending = null;
    thread = thread.filter(function (m) {
      return !m.pending;
    });
  }

  function setPending(kind) {
    clearPending();
    pending = kind;
    thread.push({
      role: kind === "host" ? "host" : "agent",
      text: "...",
      pending: true
    });
    render();
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
    var beat = beatFor(current.id);
    if (idle) {
      var intro = (currentPlaylist && currentPlaylist.intro) || INTRO;
      if (currentPlaylist && currentPlaylist.title) {
        intro = currentPlaylist.title + " — " + intro;
      }
      text($("caption"), intro);
    } else if (verdict && verdict.call === "override") text($("caption"), OVERRIDE_CAPTION);
    else if (beat && beat.caption) text($("caption"), beat.caption);
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
    } else if (pending === "agent") {
      wanted = "...";
    }
    text($("wanted-text"), wanted);

    var badge = $("happened-badge");
    var happened = "Press Play.";
    var hears = $("guest-hears");
    hears.classList.remove("pending-text");
    if (!verdict) {
      setCallClass(badge, "idle");
      if (pending === "agent") {
        text(badge, "…");
        happened = "...";
        text(hears, "...");
        hears.classList.add("pending-text");
      } else {
        text(badge, "idle");
        text(hears, idle ? "Nothing yet." : "...");
        if (!idle) hears.classList.add("pending-text");
      }
    } else if (verdict.call === "act" && verdict.ticket) {
      setCallClass(badge, "act");
      text(badge, "Allowed");
      happened = "Answered from the stay. No human needed.";
      text(hears, verdict.guest_reply || "Replied.");
    } else if (verdict.call === "override") {
      setCallClass(badge, "override");
      text(badge, "Host override");
      happened = "Host moved the money. The agent still could not.";
      text(hears, verdict.guest_reply || "Host refunded.");
    } else if (verdict.call === "escalate") {
      setCallClass(badge, "escalate");
      text(badge, "Ask a human");
      happened = "Did not move money. A host owns this.";
      text(
        hears,
        verdict.guest_reply || "Nothing promised. Host queue opened."
      );
    } else {
      setCallClass(badge, "stop");
      text(badge, "Stopped");
      happened = "Did not confirm. Did not send a door code.";
      text(
        hears,
        (current.ui && current.ui.stop_chat) || "Nothing sent — the slot was gone."
      );
    }
    text($("happened-text"), happened);

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
      fillList($("workflows"), verdict.workflow || []);
      text($("packet"), JSON.stringify(verdict.packet, null, 2));
    } else {
      setCallClass($("verdict-call"), "idle");
      text($("verdict-ticket"), "—");
      $("verdict-ticket").className = "badge";
      fillList($("workflows"), []);
      text($("packet"), "");
    }

    fillEvalsNav();
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
    if (!opts.silentGuest) {
      pushGuestMessage();
      setPending("agent");
      return;
    }
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

  function proposeModel() {
    if (!current || proposing) return Promise.resolve();
    proposing = true;
    if (pending !== "agent") setPending("agent");
    setStatus("busy", "model proposing…");
    var beat = beatFor(current.id);
    var body = {
      fixture: current,
      stay: stay,
      memory: memory,
      guest_message: current.guest_message && current.guest_message.text,
      story: {
        id: currentPlaylist && currentPlaylist.id,
        title: currentPlaylist && currentPlaylist.title,
        caption: beat && beat.caption
      }
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
    if (pending !== "agent") setPending("agent");
    if (keyed) return proposeModel();
    var id = runId;
    return new Promise(function (resolve) {
      setTimeout(function () {
        if (id !== runId) {
          resolve();
          return;
        }
        proposeGreedy();
        resolve();
      }, 900);
    });
  }

  // Server-gated path: /api/act runs propose + veto() + persist in one call,
  // using a fixture the server loads itself (never trusting this page's
  // copy). Mirrors proposeModel()'s render effects for the "proposing" half
  // so the walkthrough's pacing looks identical either way. Resolves false
  // on any failure (network, expired UI key, 5xx) so the caller can fall
  // back to the original proposeBest()/applyVeto() flow untouched.
  function proposeServerAct() {
    actResult = null;
    if (!current) return Promise.resolve(false);
    var beat = beatFor(current.id);
    if (!beat || !beat.file) return Promise.resolve(false);
    if (pending !== "agent") setPending("agent");
    setStatus("busy", "model proposing…");
    var body = {
      fixture_file: beat.file,
      guest_message: current.guest_message && current.guest_message.text,
      story: {
        id: currentPlaylist && currentPlaylist.id,
        title: currentPlaylist && currentPlaylist.title,
        caption: beat.caption
      }
    };
    return fetch("/api/act", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Act-Key": UI_ACT_KEY },
      body: JSON.stringify(body)
    })
      .then(function (r) {
        return r.json().then(function (j) {
          return { okHttp: r.ok, json: j };
        });
      })
      .then(function (pack) {
        var j = pack.json || {};
        if (pack.okHttp && j.ok && j.verdict && j.proposal) {
          actResult = j;
          proposal = j.proposal;
          proposalSrc = "model · " + (j.model || modelName) + " · server-gated";
          trace = j.trace || [];
          verdict = null;
          setStatus("live", "live · " + (j.model || modelName) + " · persisted");
          render();
          return true;
        }
        return false;
      })
      .catch(function () {
        return false;
      });
  }

  // Consumes the result proposeServerAct() already fetched — no second
  // request, no local veto()/applyMemory() call, since the server already
  // ran both. Returns false (does nothing) if there's no server result to
  // apply, so the caller falls back to the original applyVeto().
  function applyServerVerdict() {
    if (!actResult) return false;
    clearPending();
    verdict = actResult.verdict;
    memory = actResult.memory || memory;
    if (verdict.guest_reply) {
      thread.push({ role: "agent", text: verdict.guest_reply, eval: current.id });
    } else if (verdict.call === "stop") {
      thread.push({
        role: "system",
        text:
          (current.ui && current.ui.stop_chat) ||
          "Stopped. The slot was gone. No confirmation sent.",
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
    actResult = null;
    return true;
  }

  function applyVeto() {
    if (!current || !proposal) return;
    clearPending();
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
        text:
          (current.ui && current.ui.stop_chat) ||
          "Stopped. The slot was gone. No confirmation sent.",
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
    if (walking && verdict.call === "escalate") {
      var beat = beatFor(current.id);
      if (beat && beat.host_override) setPending("host");
    }
  }

  function applyHostOverride() {
    if (!current || !verdict) return;
    clearPending();
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
        text:
          (current.host_override && current.host_override.host_chat) ||
          "Approved. Money can move.",
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

  function clearServerMemory() {
    if (!stay) return;
    fetch(
      "/api/act/memory?booking_id=" + encodeURIComponent(stay.stay.booking_id),
      { method: "DELETE", headers: { "X-Act-Key": UI_ACT_KEY } }
    ).catch(function () {
      /* best-effort — a new story still resets the client's own view */
    });
  }

  function resetAll() {
    if (walkTimer) {
      clearTimeout(walkTimer);
      walkTimer = null;
    }
    clearServerMemory();
    memory = JSON.parse(JSON.stringify(stay.memory_persist));
    walking = false;
    idle = true;
    pending = null;
    runId += 1;
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
    var startId =
      (currentPlaylist &&
        currentPlaylist.beats &&
        currentPlaylist.beats[0] &&
        currentPlaylist.beats[0].id) ||
      (fixtures[0] && fixtures[0].id);
    if (startId) selectEval(startId, { silentGuest: true, keepIdle: true });
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
    var beats = (currentPlaylist && currentPlaylist.beats) || [];
    var steps = [];
    var pauseAfter = [];
    beats.forEach(function (beat) {
      (function (id, withHost) {
        steps.push(function () {
          selectEval(id);
          return Promise.resolve();
        });
        pauseAfter.push(4000);
        steps.push(function () {
          return proposeServerAct().then(function (ok) {
            if (!ok) return proposeBest();
          });
        });
        pauseAfter.push(3500);
        steps.push(function () {
          if (!applyServerVerdict()) applyVeto();
          return Promise.resolve();
        });
        pauseAfter.push(7000);
        if (withHost) {
          steps.push(function () {
            applyHostOverride();
            return Promise.resolve();
          });
          pauseAfter.push(7000);
        }
      })(beat.id, !!beat.host_override);
    });
    steps.push(function () {
      text(
        $("caption"),
        (currentPlaylist && currentPlaylist.done) || "Done."
      );
      walking = false;
      text($("btn-walk"), "Play");
      return Promise.resolve();
    });
    pauseAfter.push(0);
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

  function loadJson(rel) {
    return fetch(rel).then(function (r) {
      if (!r.ok) throw new Error(rel + " " + r.status);
      return r.json();
    });
  }

  function load() {
    return loadJson("fixtures/scenarios.json").then(function (pack) {
      scenarios = pack || { playlists: [] };
      var files = [];
      var seen = {};
      (scenarios.playlists || []).forEach(function (p) {
        (p.beats || []).forEach(function (b) {
          if (b.file && !seen[b.file]) {
            seen[b.file] = true;
            files.push(b.file);
          }
        });
      });
      return Promise.all(
        [loadJson("fixtures/stay.json")].concat(
          files.map(function (name) {
            return loadJson("fixtures/" + name);
          })
        )
      ).then(function (rows) {
        stay = rows[0];
        fixtures = rows.slice(1);
        currentPlaylist = pickNextPlaylist() || firstPlaylist();
        return rows;
      });
    });
  }

  document.addEventListener("click", function (ev) {
    var t = ev.target;
    if (!(t instanceof HTMLElement)) return;
    var evalId = t.getAttribute("data-eval");
    if (evalId) selectEval(evalId);
    if (t.id === "btn-model") proposeModel();
    if (t.id === "btn-greedy") proposeGreedy();
    if (t.id === "btn-veto") applyVeto();
    if (t.id === "btn-override") applyHostOverride();
    if (t.id === "btn-reset") resetAll();
    if (t.id === "btn-walk") walkMission();
    if (t.id === "btn-internals") toggleInternals();
  });

  load()
    .then(function () {
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
