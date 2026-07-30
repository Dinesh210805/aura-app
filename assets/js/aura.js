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

      document.querySelectorAll("[data-rel-href]").forEach(function (el) {
        el.setAttribute("href", apk.browser_download_url);
      });
    })
    .catch(function () {
      /* Offline, rate-limited, or blocked. The authored values stand. */
    });
})();
