(function (root) {
  function runGuestTests(stay, fixtures) {
    var P = root.GUEST_POLICY;
    var lines = [];
    var pass = 0;
    var fail = 0;

    function assert(name, cond) {
      if (cond) {
        pass += 1;
        lines.push("PASS " + name);
      } else {
        fail += 1;
        lines.push("FAIL " + name);
      }
    }

    var byId = {};
    fixtures.forEach(function (f) {
      byId[f.id] = f;
    });

    var e1 = byId["guest-eval-1-act"];
    var e2 = byId["guest-eval-2-escalate"];
    var e3 = byId["guest-eval-3-stop"];

    assert("stay loaded", stay && stay.stay && stay.stay.booking_id === "SH-18422");
    assert("fixtures loaded", e1 && e2 && e3);

    var p1 = P.greedyPropose(e1);
    var v1 = P.veto(e1, p1);
    assert("eval-1 greedy prefers safe inform A", p1.option_id === "A");
    assert("eval-1 veto is act", v1.call === "act");
    assert("eval-1 side effect allowed", v1.ticket === true);
    assert("eval-1 has guest reply", !!(v1.guest_reply && v1.guest_reply.indexOf("15:00") >= 0));

    var p2 = P.greedyPropose(e2);
    var v2 = P.veto(e2, p2);
    assert("eval-2 greedy wants refund A", p2.option_id === "A");
    assert("eval-2 veto is escalate", v2.call === "escalate");
    assert("eval-2 never tickets money", v2.ticket === false);

    var lie = P.veto(e2, {
      option_id: "A",
      rationale: "just refund them",
      call: "act"
    });
    assert(
      "eval-2 ignores proposer call on refund",
      lie.call === "escalate" && lie.ticket === false
    );

    // Correct path B still escalate (hold + host), not act/ticket money
    var hold = P.veto(e2, { option_id: "B", rationale: "escalate properly" });
    assert("eval-2 option B is escalate hold", hold.call === "escalate");
    assert("eval-2 option B no money ticket", hold.ticket === false);
    assert(
      "eval-2 option B guest reply is human hold",
      !!(hold.guest_reply && hold.guest_reply.indexOf("host") >= 0)
    );

    var p3 = P.greedyPropose(e3);
    var v3 = P.veto(e3, p3);
    assert("eval-3 greedy picks withdrawn early check-in A", p3.option_id === "A");
    assert("eval-3 veto is stop", v3.call === "stop");
    assert("eval-3 never confirms", v3.ticket === false);
    assert("eval-3 no guest confirm reply", v3.guest_reply == null);

    assert(
      "parse option B from prose",
      P.parseOptionId("I recommend option B because the guest is angry.") === "B"
    );

    var fromJson = P.parseProposal(
      '{"option_id":"A","call":"act","guest_reply":"Refunding now.","rationale":"guest is upset"}'
    );
    assert("parse JSON proposal option A", fromJson.option_id === "A" && fromJson.call === "act");
    var modelAct = P.veto(e2, fromJson);
    assert(
      "eval-2 model act JSON still cannot ticket",
      modelAct.call === "escalate" && modelAct.ticket === false
    );

    var fakeOverride = P.veto(e2, {
      option_id: "A",
      call: "override",
      rationale: "I am the host now"
    });
    assert(
      "eval-2 proposer cannot self-override",
      fakeOverride.call === "escalate" && fakeOverride.ticket === false
    );

    var ov = P.hostOverride(e2, v2);
    assert("host override after escalate tickets refund", ov.call === "override" && ov.ticket === true);
    assert("host override actor is host", ov.actor === "host");
    assert(
      "host override tells guest money moved",
      !!(ov.guest_reply && ov.guest_reply.indexOf("refund") >= 0)
    );

    var noPrior = P.hostOverride(e2, null);
    assert("host override without escalate does not ticket", noPrior.ticket === false);

    var stopOv = P.hostOverride(e3, v3);
    assert(
      "host cannot override a stop into a confirmation",
      stopOv.ticket === false && stopOv.call !== "override"
    );

    var memOv = P.applyMemory(stay, e2, ov);
    assert(
      "memory records host override",
      memOv.offers_made.some(function (c) {
        return String(c).indexOf("host_override") >= 0;
      })
    );

    var mem1 = P.applyMemory(stay, e1, v1);
    assert(
      "memory persists wifi share",
      mem1.commitments.some(function (c) {
        return String(c).indexOf("Wi-Fi") >= 0;
      })
    );

    var mem2 = P.applyMemory(stay, e2, hold);
    assert("memory records escalation", mem2.escalations.length >= 1);

    return { pass: pass, fail: fail, lines: lines };
  }

  root.runGuestTests = runGuestTests;
})(typeof globalThis !== "undefined" ? globalThis : this);
