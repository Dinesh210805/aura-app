/* ==========================================================================
   AURA — site behaviour
   --------------------------------------------------------------------------
   Progressive enhancement only. Every page is complete and correct with
   JavaScript disabled; nothing here is load-bearing.
   ========================================================================== */

(function () {
  "use strict";

  var reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ----------------------------------------------------------------------
     Theme
     ----------------------------------------------------------------------
     Three states, not two: "light", "dark", and unset (follow the OS). The
     toggle only ever writes an explicit value, so a visitor who never touches
     it keeps tracking their system setting for the life of the site.
     ---------------------------------------------------------------------- */

  var root = document.documentElement;

  function currentTheme() {
    var saved = root.getAttribute("data-theme");
    if (saved) return saved;
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }

  document.querySelectorAll(".theme-btn").forEach(function (btn) {
    btn.addEventListener("click", function () {
      var next = currentTheme() === "dark" ? "light" : "dark";
      root.setAttribute("data-theme", next);
      try {
        localStorage.setItem("aura-theme", next);
      } catch (e) {
        /* private mode — the choice just won't persist */
      }
      btn.setAttribute("aria-label", next === "dark" ? "Switch to light theme" : "Switch to dark theme");
    });
  });

  /* ----------------------------------------------------------------------
     Mobile navigation
     ----------------------------------------------------------------------
     The panel is a real <nav> that is simply hidden, so it is in the tab order
     and readable by assistive tech the moment it opens. Closing always returns
     focus to the button that opened it — otherwise a keyboard user is dropped
     back at the top of the document with no idea where they are.
     ---------------------------------------------------------------------- */

  var navBtn = document.querySelector(".nav-btn");
  var mnav = document.getElementById("mobilenav");

  if (navBtn && mnav) {
    var setNav = function (open) {
      mnav.hidden = !open;
      navBtn.setAttribute("aria-expanded", open ? "true" : "false");
      navBtn.setAttribute("aria-label", open ? "Close menu" : "Open menu");
      document.body.classList.toggle("is-locked", open);
      // Focus the panel, not its first link: moving focus to a specific item
      // paints a focus ring on an arbitrary choice, while focusing the region
      // still moves screen-reader and keyboard position into it.
      if (open) mnav.focus();
    };

    navBtn.addEventListener("click", function () {
      setNav(mnav.hidden);
    });

    // An in-page anchor doesn't navigate, so the panel would stay open on top
    // of the section the visitor just asked to see.
    mnav.addEventListener("click", function (e) {
      if (e.target.closest("a")) setNav(false);
    });

    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && !mnav.hidden) {
        setNav(false);
        navBtn.focus();
      }
    });

    // Rotating to landscape can cross the breakpoint and hide the close button,
    // stranding the panel open with no way out.
    window.addEventListener("resize", function () {
      if (window.innerWidth > 860 && !mnav.hidden) setNav(false);
    });
  }

  /* ----------------------------------------------------------------------
     Header shadow — only once the page has actually scrolled
     ---------------------------------------------------------------------- */

  var hdr = document.querySelector(".hdr");
  if (hdr) {
    var onScroll = function () {
      hdr.setAttribute("data-stuck", window.scrollY > 8 ? "true" : "false");
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
  }

  /* ----------------------------------------------------------------------
     Reveal on scroll
     ---------------------------------------------------------------------- */

  var revealables = document.querySelectorAll("[data-reveal]");

  if (reduced || !("IntersectionObserver" in window)) {
    revealables.forEach(function (el) {
      el.classList.add("is-in");
    });
  } else {
    var io = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (!entry.isIntersecting) return;
          entry.target.classList.add("is-in");
          io.unobserve(entry.target);
        });
      },
      { rootMargin: "0px 0px -8% 0px", threshold: 0.08 }
    );
    revealables.forEach(function (el) {
      io.observe(el);
    });
  }

  /* ----------------------------------------------------------------------
     Copy buttons
     ----------------------------------------------------------------------
     The label reports what happened ("Copied"), then returns to what it does
     ("Copy") — same vocabulary through the whole interaction.
     ---------------------------------------------------------------------- */

  document.querySelectorAll("[data-copy]").forEach(function (btn) {
    btn.addEventListener("click", function () {
      var sel = btn.getAttribute("data-copy");
      var src = sel ? document.querySelector(sel) : btn.previousElementSibling;
      if (!src) return;

      var text = (src.innerText || src.textContent || "")
        .split("\n")
        .map(function (line) {
          return line.replace(/^\s*\$\s?/, ""); // drop the shell prompt
        })
        .join("\n")
        .trim();

      var done = function (ok) {
        var original = btn.getAttribute("data-label") || "Copy";
        btn.textContent = ok ? "Copied" : "Press ⌘C";
        setTimeout(function () {
          btn.textContent = original;
        }, 1600);
      };

      if (navigator.clipboard && window.isSecureContext) {
        navigator.clipboard.writeText(text).then(
          function () {
            done(true);
          },
          function () {
            done(false);
          }
        );
      } else {
        done(false);
      }
    });
  });

  /* ----------------------------------------------------------------------
     Video slots
     ----------------------------------------------------------------------
     A slot holds a <video> whose file may not exist yet. If it loads, drop
     the dashed placeholder styling and let the footage speak. If it 404s,
     the labelled empty state stays — so a missing file degrades to a caption
     rather than a broken frame.
     ---------------------------------------------------------------------- */

  document.querySelectorAll(".slot video, .phone__video").forEach(function (video) {
    var slot = video.closest(".slot");

    video.addEventListener("loadeddata", function () {
      if (slot) {
        slot.style.border = "1px solid var(--outline)";
        var label = slot.querySelector(".slot__label");
        if (label) label.style.display = "none";
      }
      video.style.display = "block";
      if (!reduced) {
        var p = video.play();
        if (p && p.catch) p.catch(function () {});
      }
    });

    video.addEventListener("error", function () {
      video.style.display = "none";
    });
  });

  /* ----------------------------------------------------------------------
     Hero video — sound off by default, unmute on tap
     ----------------------------------------------------------------------
     Autoplay policy forces muted playback, so the unmute button is not a
     convenience but the only way to get audio. The tooltip greets visitors
     once the page settles, then again if they mute it back.
     ---------------------------------------------------------------------- */

  var heroVideo = document.querySelector(".hero__video");

  if (heroVideo) {
    var stage = heroVideo.closest(".hero__stage");
    var muteBtn = stage && stage.querySelector(".hero__mute");
    var tip = stage && stage.querySelector(".hero__tip");
    var tipTimer = null;

    var hideTip = function () {
      if (tip) tip.classList.remove("is-show");
    };

    var showTip = function () {
      if (!tip || reduced) return;
      tip.classList.add("is-show");
      clearTimeout(tipTimer);
      tipTimer = setTimeout(hideTip, 6000);
    };

    if (muteBtn) {
      muteBtn.addEventListener("click", function () {
        heroVideo.muted = !heroVideo.muted;
        var muted = heroVideo.muted;
        muteBtn.setAttribute("aria-pressed", muted ? "false" : "true");
        muteBtn.setAttribute("aria-label", muted ? "Unmute video" : "Mute video");
        hideTip();
        if (muted) setTimeout(showTip, 600);
      });
    }

    // The greeting — after the reveal has settled, teach the affordance.
    setTimeout(showTip, 1600);
  }

  /* ----------------------------------------------------------------------
     Checkable install steps
     ----------------------------------------------------------------------
     These steps are performed ON the phone reading them, so the visitor leaves
     the browser at almost every one — into Settings, into Play Protect, back.
     Ticking off progress that survives that round trip is the difference
     between a list and a checklist.

     Built by script rather than authored into the markup: a checkbox that
     forgets on reload is worse than no checkbox, so it only exists where the
     persistence backing it also exists.
     ---------------------------------------------------------------------- */

  document.querySelectorAll("[data-checklist]").forEach(function (list) {
    var steps = [].slice.call(list.querySelectorAll(".step"));
    // Progress is stored by position, so the step count is part of the key.
    // These steps are the likeliest thing on the site to change; without this,
    // inserting one would silently move every returning visitor's ticks onto
    // the wrong rows. Versioning orphans the old key instead of mis-mapping it.
    var key = "aura-steps-" + list.getAttribute("data-checklist") + "-v" + steps.length;

    var read = function () {
      try {
        return JSON.parse(localStorage.getItem(key)) || [];
      } catch (e) {
        return [];
      }
    };
    var write = function (v) {
      try {
        localStorage.setItem(key, JSON.stringify(v));
      } catch (e) {
        /* private mode — the ticks still work for this visit */
      }
    };

    var done = read();

    var progress = document.createElement("p");
    progress.className = "steps__progress";

    // Built with DOM nodes rather than innerHTML. Nothing here is user input
    // today, but a status line is exactly the kind of string that later grows
    // an interpolated value, and this closes that door now.
    var render = function () {
      var n = done.filter(Boolean).length;
      progress.textContent = "";

      if (n === 0) {
        var hint = document.createElement("span");
        hint.className = "steps__hint";
        hint.textContent =
          "Tap a number as you finish each step — your place is kept if you leave this page.";
        progress.appendChild(hint);
        return;
      }

      var count = document.createElement("b");
      count.textContent = n + " of " + steps.length;
      progress.appendChild(count);

      if (n === steps.length) {
        progress.appendChild(document.createTextNode(" done — that's everything."));
        return;
      }

      progress.appendChild(document.createTextNode(" done"));

      var reset = document.createElement("button");
      reset.type = "button";
      reset.className = "steps__reset";
      reset.textContent = "Reset";
      reset.addEventListener("click", function () {
        done = [];
        write(done);
        steps.forEach(function (s) {
          s.classList.remove("is-done");
          var b = s.querySelector(".step__box");
          if (b) b.checked = false;
        });
        render();
      });
      progress.appendChild(reset);
    };

    steps.forEach(function (step, i) {
      var numEl = step.querySelector(".step__n");
      if (!numEl) return;

      var label = document.createElement("label");
      label.className = "step__check";

      var box = document.createElement("input");
      box.type = "checkbox";
      box.className = "step__box";
      box.checked = !!done[i];

      var title = step.querySelector(".step__t");
      box.setAttribute(
        "aria-label",
        "Mark step " + (i + 1) + (title ? ", " + title.textContent.trim() : "") + ", as done"
      );

      numEl.parentNode.insertBefore(label, numEl);
      label.appendChild(box);
      label.appendChild(numEl);

      if (done[i]) step.classList.add("is-done");

      box.addEventListener("change", function () {
        done[i] = box.checked;
        step.classList.toggle("is-done", box.checked);
        write(done);
        render();
      });
    });

    if (steps.length) {
      list.parentNode.insertBefore(progress, list.nextSibling);
      render();
    }
  });

  /* ----------------------------------------------------------------------
     Device awareness
     ----------------------------------------------------------------------
     Two jobs: get a visitor to their own brand's extra steps in one tap, and
     tell a desktop visitor this is an Android app before they hunt for a .exe.

     Detection here is a HINT, never a gate. Nothing is hidden based on it and
     every brand stays one tap away, because it is genuinely unreliable:
     Chrome's User-Agent Reduction reports Android model as the literal string
     "K", and the real model from userAgentData is often a bare code like
     "2201123G" or "CPH2451" with no brand name in it at all.
     ---------------------------------------------------------------------- */

  var isAndroid = /android/i.test(navigator.userAgent);

  function brandFrom(text) {
    var s = String(text || "").toLowerCase();
    if (!s) return null;
    // Order matters and mirrors the app's own OemCompat.detect(): OnePlus is
    // tested before OPPO because OxygenOS devices report OPPO-style CPH model
    // codes and would otherwise be misfiled.
    if (/xiaomi|redmi|poco/.test(s)) return "xiaomi";
    if (/oneplus|\b(kb|le|in|dn|be|gm|hd)2\d{3}\b/.test(s)) return "oneplus";
    if (/oppo|realme|\bcph\d{4}\b|\brmx\d{4}\b/.test(s)) return "oppo";
    if (/vivo|iqoo/.test(s)) return "vivo";
    if (/huawei|honor/.test(s)) return "huawei";
    if (/samsung|\bsm-[a-z]\d{3}/.test(s)) return "samsung";
    if (/pixel|motorola|\bmoto\b|nothing phone/.test(s)) return "other";
    return null;
  }

  var picker = document.getElementById("brandpicker");
  var brandAcc = document.getElementById("brandacc");

  if (picker && brandAcc) {
    var items = [].slice.call(brandAcc.querySelectorAll("details[data-brand]"));

    var select = function (brand, scroll) {
      items.forEach(function (d) {
        d.open = d.getAttribute("data-brand") === brand;
      });
      [].forEach.call(picker.querySelectorAll(".picker__chip"), function (c) {
        c.setAttribute("aria-pressed", c.dataset.for === brand ? "true" : "false");
      });
      if (scroll) {
        var open = brandAcc.querySelector("details[open]");
        if (open) {
          var y = open.getBoundingClientRect().top + window.scrollY - 84;
          window.scrollTo({ top: y, behavior: reduced ? "auto" : "smooth" });
        }
      }
    };

    var label = document.createElement("span");
    label.className = "picker__label";
    label.textContent = "Jump to";
    picker.appendChild(label);

    items.forEach(function (d) {
      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "picker__chip";
      btn.dataset.for = d.getAttribute("data-brand");
      btn.textContent = d.getAttribute("data-chip") || d.getAttribute("data-brand");
      btn.setAttribute("aria-pressed", "false");
      btn.setAttribute("aria-controls", "brandacc");
      btn.addEventListener("click", function () {
        select(btn.dataset.for, true);
      });
      picker.appendChild(btn);
    });

    picker.hidden = false;

    // Keep the chips in step when someone opens a section directly instead.
    items.forEach(function (d) {
      d.addEventListener("toggle", function () {
        if (!d.open) return;
        items.forEach(function (o) {
          if (o !== d) o.open = false;
        });
        [].forEach.call(picker.querySelectorAll(".picker__chip"), function (c) {
          c.setAttribute("aria-pressed", c.dataset.for === d.getAttribute("data-brand") ? "true" : "false");
        });
      });
    });

    var markDetected = function (brand) {
      if (!brand) return;
      var chip = picker.querySelector('.picker__chip[data-for="' + brand + '"]');
      if (!chip) return;
      chip.setAttribute("data-detected", "");
      // Open it, but don't scroll — the visitor didn't ask to be moved.
      select(brand, false);

      var note = document.createElement("p");
      note.className = "picker__note";
      note.textContent =
        "We think this is your phone, so its steps are open below. If that's wrong, pick your brand above — the guess is often imperfect.";
      picker.appendChild(note);
    };

    // Cheap pass on the UA string first; then ask for the real model, which is
    // the only reliable source on Chrome but needs an async permissioned call.
    var guess = brandFrom(navigator.userAgent);
    var uaData = navigator.userAgentData;

    if (uaData && uaData.getHighEntropyValues) {
      uaData
        .getHighEntropyValues(["model"])
        .then(function (v) {
          markDetected(brandFrom(v && v.model) || guess);
        })
        .catch(function () {
          markDetected(guess);
        });
    } else {
      markDetected(guess);
    }
  }

  /* The handoff card ships with the expected public address hard-coded so it
     reads correctly with JS off, then corrects itself to wherever the site is
     actually being served from — a custom domain, a preview deploy, anything. */
  var pageUrl = document.getElementById("pageurl");
  if (pageUrl) {
    pageUrl.textContent = (location.host + location.pathname).replace(/\/index\.html$/, "/");
  }

  /* On the right device already: say "install", not "download". */
  if (isAndroid) {
    document.querySelectorAll("[data-android-label]").forEach(function (el) {
      el.childNodes[0].nodeValue = el.getAttribute("data-android-label") + " ";
    });
  }

  /* ----------------------------------------------------------------------
     Working traces — the portrait demo cards
     ----------------------------------------------------------------------
     Each card owns a <div class="demo-card__trace" data-trace="…"> slot,
     hidden until assets/data/traces.json answers. That file is built by
     site/scripts/build-traces.py from the phone's own session logs, pulled
     over adb (files/mcp_logs/<sessionId>/metadata.json) and cleaned so the
     rendered run reads cleanly. The card shows the top of the log; the
     button opens the complete trace in a modal, right here in the page.

     Everything is built with DOM nodes, never innerHTML — the trace fields
     are data pulled off a device and are treated as untrusted.
     ---------------------------------------------------------------------- */

  var traceBlocks = document.querySelectorAll("[data-trace]");

  if (traceBlocks.length && "fetch" in window) {
    var traceModal = null;
    var traceTrigger = null;

    var fmtTokens = function (n) {
      if (n >= 1e6) return (n / 1e6).toFixed(1) + "M";
      if (n >= 1e3) return Math.round(n / 1e3) + "k";
      return String(n);
    };

    var fmtDur = function (s) {
      if (s >= 60) {
        var m = Math.floor(s / 60);
        return m + "m " + (s - m * 60) + "s";
      }
      return s + "s";
    };

    var fmtClock = function (sec) {
      var m = Math.floor(sec / 60);
      var s = sec % 60;
      return (m < 10 ? "0" + m : m) + ":" + (s < 10 ? "0" + s : s);
    };

    function node(tag, cls, text) {
      var n = document.createElement(tag);
      if (cls) n.className = cls;
      if (text !== undefined) n.textContent = text;
      return n;
    }

    var closeTrace = function () {
      if (!traceModal || traceModal.hidden) return;
      traceModal.hidden = true;
      document.body.classList.remove("is-locked");
      if (traceTrigger) traceTrigger.focus();
    };

    var openTrace = function (trace, card) {
      if (!traceModal) traceModal = buildTraceModal();

      var title = card.querySelector("h3");
      traceModal.querySelector(".trace-panel__title").textContent =
        title ? title.textContent : "Working trace";

      traceModal.querySelector(".trace-panel__cmd").textContent =
        "“" + (trace.command || "…") + "”";

      traceModal.querySelector(".trace-panel__result-text").textContent =
        trace.result || "";

      var stepsEl = traceModal.querySelector(".trace-panel__steps");
      stepsEl.textContent = "";
      (trace.steps || []).forEach(function (s) {
        var row = node("div", "trace-step" + (s.ok ? "" : " is-fail"));

        var head = node("div", "trace-step__head");
        head.appendChild(node("span", "trace-step__time", fmtClock(s.at || 0)));
        head.appendChild(node("span", "trace-step__tool", s.tool));
        if (s.ms != null) head.appendChild(node("span", "trace-step__ms", s.ms + "ms"));
        if (!s.ok) head.appendChild(node("span", "trace-step__badge", "failed"));
        row.appendChild(head);

        if (s.args) row.appendChild(node("p", "trace-step__args", s.args));
        if (s.out) row.appendChild(node("p", "trace-step__out", s.out));
        if (s.gesture) {
          var g = "gesture: " + s.gesture;
          if (s.xy && s.xy.length === 2) g += " @ " + s.xy.join(", ");
          row.appendChild(node("p", "trace-step__args", g));
        }
        stepsEl.appendChild(row);
      });

      var foot = traceModal.querySelector(".trace-panel__foot");
      foot.textContent = "";
      var st = trace.stats || {};
      foot.appendChild(node("span", "", "session " + (trace.sessionId || "?")));
      foot.appendChild(node("span", "", "agent: " + (trace.agent || "?")));
      foot.appendChild(
        node("span", "", st.calls + " tool calls · " + fmtTokens(st.tokens || 0) + " tokens · " + fmtDur(trace.durationS || 0))
      );
      foot.appendChild(node("span", "", trace.startedAt || ""));

      traceModal.hidden = false;
      document.body.classList.add("is-locked");
      var closeBtn = traceModal.querySelector(".trace-panel__close");
      if (closeBtn) closeBtn.focus();
    };

    var buildTraceModal = function () {
      var modal = node("div", "trace-modal");
      modal.hidden = true;
      modal.setAttribute("role", "dialog");
      modal.setAttribute("aria-modal", "true");

      var panel = node("div", "trace-panel");

      var head = node("header", "trace-panel__head");
      var headTxt = node("div");
      headTxt.appendChild(node("p", "eyebrow", "Working trace"));
      headTxt.appendChild(node("h3", "t-card trace-panel__title"));
      headTxt.appendChild(node("p", "trace-panel__cmd"));
      head.appendChild(headTxt);

      var closeBtn = node("button", "icon-btn trace-panel__close");
      closeBtn.type = "button";
      closeBtn.setAttribute("aria-label", "Close trace");
      closeBtn.innerHTML =
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M5 5l14 14M19 5 5 19"/></svg>';
      closeBtn.addEventListener("click", closeTrace);
      head.appendChild(closeBtn);
      panel.appendChild(head);

      var result = node("div", "trace-panel__result");
      result.appendChild(node("span", "trace__k", "What it found"));
      result.appendChild(node("p", "trace-panel__result-text"));
      panel.appendChild(result);

      panel.appendChild(node("div", "trace-panel__steps"));
      panel.appendChild(node("footer", "trace-panel__foot"));

      modal.appendChild(panel);

      modal.addEventListener("click", function (e) {
        if (e.target === modal) closeTrace();
      });
      document.addEventListener("keydown", function (e) {
        if (e.key === "Escape" && !modal.hidden) closeTrace();
      });

      document.body.appendChild(modal);
      return modal;
    };

    fetch("assets/data/traces.json")
      .then(function (r) {
        if (!r.ok) throw new Error("traces lookup failed: " + r.status);
        return r.json();
      })
      .then(function (data) {
        var byId = {};
        (data.traces || []).forEach(function (t) {
          byId[t.id] = t;
        });

        traceBlocks.forEach(function (block) {
          var trace = byId[block.getAttribute("data-trace")];
          if (!trace) return;
          var st = trace.stats || {};

          var meta = node("div", "trace__meta");
          var chips = [
            [st.calls, " tool calls"],
            [st.ok + "/" + st.calls, " ok"],
            [fmtTokens(st.tokens || 0), " tokens"],
            [fmtDur(trace.durationS || 0), ""],
            [trace.agent || "", ""]
          ];
          chips.forEach(function (c) {
            if (!c[0]) return;
            var chip = node("span", "trace__chip");
            chip.appendChild(node("b", "", String(c[0])));
            chip.appendChild(document.createTextNode(c[1]));
            meta.appendChild(chip);
          });

          var line = node("p", "trace__line");
          line.textContent = (trace.result || "").slice(0, 190) + ((trace.result || "").length > 190 ? "…" : "");
          line.insertBefore(node("b", "", "Last run — top of the log"), line.firstChild);

          var card = block.closest(".demo-card") || block;
          var title = card.querySelector("h3");
          var btn = node("button", "btn btn--ghost trace__btn", "Show full trace");
          btn.type = "button";
          if (title) {
            btn.setAttribute("aria-label", "Show the complete working trace for " + title.textContent);
          }
          btn.innerHTML +=
            '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg>';
          btn.addEventListener("click", function () {
            traceTrigger = btn;
            openTrace(trace, card);
          });

          block.appendChild(meta);
          block.appendChild(line);
          block.appendChild(btn);
          block.hidden = false;
        });
      })
      .catch(function () {
        /* traces.json missing or unreachable — the slots stay hidden and the
           cards read exactly as they did before this feature existed. */
      });
  }

  /* ----------------------------------------------------------------------
     Live release info
     ----------------------------------------------------------------------
     The page ships with the current release hard-coded, so it is correct with
     JS off and correct if GitHub is unreachable. When the API does answer, the
     version, size, date and download link are refreshed from it — which means
     publishing a new APK updates this site without anyone editing HTML.

     Anything not present in the response is left exactly as authored.
     ---------------------------------------------------------------------- */

  var needsRelease = document.querySelector("[data-rel]");
  if (!needsRelease || !("fetch" in window)) return;

  fetch("https://api.github.com/repos/Dinesh210805/aura-releases/releases/latest", {
    headers: { Accept: "application/vnd.github+json" }
  })
    .then(function (r) {
      if (!r.ok) throw new Error("release lookup failed: " + r.status);
      return r.json();
    })
    .then(function (rel) {
      var apk = (rel.assets || []).filter(function (a) {
        return /\.apk$/i.test(a.name);
      })[0];
      if (!apk) return;

      var version = String(rel.tag_name || "").replace(/^v/, "");
      var sizeMb = Math.round((apk.size / 1048576) * 10) / 10;
      var published = rel.published_at ? new Date(rel.published_at) : null;

      var set = function (key, value) {
        if (value === null || value === undefined || value === "") return;
        document.querySelectorAll('[data-rel="' + key + '"]').forEach(function (el) {
          el.textContent = value;
        });
      };

      set("version", version);
      set("size", sizeMb + " MB");
      set("filename", apk.name);
      if (published) {
        set(
          "date",
          published.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" })
        );
      }

      // --- facts that live in the release notes, not the API's own fields ---
      //
      // Both of these are prose in a hand-written notes file, so both parsers
      // fail CLOSED: unless the shape is unmistakable, the authored value is
      // left exactly as it is. A wrong checksum is worse than a stale one.
      var notes = String(rel.body || "");

      // Accept only when the whole note contains exactly one 64-hex run. Two
      // would mean the format changed and we can no longer tell which is the
      // APK's; zero means it wasn't published.
      var hex = notes.match(/\b[A-Fa-f0-9]{64}\b/g);
      if (hex && hex.length === 1) set("sha", hex[0].toUpperCase());

      // Presence-based rather than sentence-shaped, so a reworded line still
      // parses. \b stops "x86" matching inside "x86_64" — underscore is a word
      // character, so there is no boundary between them.
      var abis = ["arm64-v8a", "armeabi-v7a", "x86_64", "x86"].filter(function (a) {
        return new RegExp("\\b" + a.replace(/[-]/g, "\\-") + "\\b").test(notes);
      });
      if (abis.length) set("abis", abis.join(" · "));

      document.querySelectorAll("[data-rel-href]").forEach(function (el) {
        el.setAttribute("href", apk.browser_download_url);
      });
    })
    .catch(function () {
      /* Offline, rate-limited, or blocked. The authored values stand. */
    });
})();
