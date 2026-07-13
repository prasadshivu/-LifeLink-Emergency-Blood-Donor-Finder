const API = ""; // same-origin, since Express serves this frontend too

// ---------------------------------------------------------------------
// Direct "register now" links — e.g. https://yoursite.com/#register
// Scrolls straight to the donor form and briefly highlights it, so a
// shared link takes people exactly where they need to be.
// ---------------------------------------------------------------------
window.addEventListener("DOMContentLoaded", () => {
  if (window.location.hash === "#register") {
    const target = document.getElementById("register");
    if (target) {
      target.scrollIntoView({ behavior: "smooth", block: "start" });
      target.classList.add("highlight-pulse");
      setTimeout(() => target.classList.remove("highlight-pulse"), 2200);
    }
  }
});

// ---------------------------------------------------------------------
// Cursor blood-drop trail — spawns a tiny drop as the mouse moves.
// Throttled so it doesn't flood the DOM, and skipped entirely for users
// who've asked their OS/browser for reduced motion.
// ---------------------------------------------------------------------
const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

if (!prefersReducedMotion) {
  let lastDropTime = 0;
  const DROP_INTERVAL_MS = 60;

  document.addEventListener("mousemove", (e) => {
    const now = performance.now();
    if (now - lastDropTime < DROP_INTERVAL_MS) return;
    lastDropTime = now;

    const drop = document.createElement("span");
    drop.className = "cursor-drop";
    drop.style.left = `${e.clientX - 4}px`;
    drop.style.top = `${e.clientY - 4}px`;
    drop.style.setProperty("--dx", `${(Math.random() - 0.5) * 14}px`);
    document.body.appendChild(drop);

    drop.addEventListener("animationend", () => drop.remove());
    // Safety cleanup in case animationend doesn't fire for any reason
    setTimeout(() => drop.remove(), 900);
  });
}

// ---------------------------------------------------------------------
// Share block — builds a link to the register form based on wherever
// this page is actually being served from (localhost, ngrok, or a real
// deployed domain), so it always works no matter where it's hosted.
// ---------------------------------------------------------------------
(function setupShareBlock() {
  const shareLink = `${window.location.origin}/#register`;
  const shareText = "Join me in saving lives — register as a blood donor on LifeLink:";

  const linkInput = document.getElementById("shareLinkInput");
  if (linkInput) linkInput.value = shareLink;

  // Copy to clipboard
  const copyBtn = document.getElementById("copyLinkBtn");
  const copyMsg = document.getElementById("copyMsg");
  copyBtn?.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(shareLink);
      copyMsg.textContent = "Link copied ✓";
      copyMsg.className = "copy-msg success";
    } catch (err) {
      linkInput.select();
      document.execCommand("copy");
      copyMsg.textContent = "Link copied ✓";
      copyMsg.className = "copy-msg success";
    }
    setTimeout(() => { copyMsg.textContent = ""; }, 2500);
  });

  // Native device share sheet (WhatsApp, Messages, Mail, etc. — whatever
  // the person has installed). Only shown if the browser supports it.
  const nativeBtn = document.getElementById("nativeShareBtn");
  if (navigator.share) {
    nativeBtn.addEventListener("click", () => {
      navigator.share({ title: "LifeLink — Become a Donor", text: shareText, url: shareLink }).catch(() => {});
    });
  } else if (nativeBtn) {
    nativeBtn.style.display = "none";
  }

  // Individual app share links (always available as a fallback / alternative)
  const encodedText = encodeURIComponent(shareText);
  const encodedLink = encodeURIComponent(shareLink);

  const targets = {
    shareWhatsapp: `https://wa.me/?text=${encodedText}%20${encodedLink}`,
    shareTelegram: `https://t.me/share/url?url=${encodedLink}&text=${encodedText}`,
    shareEmail: `mailto:?subject=${encodeURIComponent("Become a blood donor")}&body=${encodedText}%0A%0A${encodedLink}`,
    shareSms: `sms:?body=${encodedText}%20${encodedLink}`,
    shareTwitter: `https://twitter.com/intent/tweet?text=${encodedText}&url=${encodedLink}`,
  };
  Object.entries(targets).forEach(([id, href]) => {
    const el = document.getElementById(id);
    if (el) el.href = href;
  });
})();
const QUOTES = [
  "Donate blood. Give someone another sunrise.",
  "A drop from you can be a lifetime for someone else.",
  "Be someone's reason to keep going — donate blood.",
  "You don't need a superpower to save a life. You need blood.",
  "Every donor is a hero without a cape.",
  "Blood cannot be manufactured — it can only come from generous people like you.",
];

let quoteIndex = 0;
const quoteTextEl = document.getElementById("sidebarQuoteText");

function showQuote() {
  if (!quoteTextEl) return;
  quoteTextEl.style.opacity = 0;
  setTimeout(() => {
    quoteTextEl.textContent = QUOTES[quoteIndex];
    quoteTextEl.style.opacity = 1;
    quoteIndex = (quoteIndex + 1) % QUOTES.length;
  }, 220);
}
showQuote();
setInterval(showQuote, 4500);

// ---------------------------------------------------------------------
// Emergency search
// ---------------------------------------------------------------------
const searchForm = document.getElementById("searchForm");
const resultsEl = document.getElementById("results");
const radiusInput = document.getElementById("reqRadius");
const radiusVal = document.getElementById("radiusVal");

radiusInput.addEventListener("input", () => {
  radiusVal.textContent = radiusInput.value;
});

document.getElementById("useLocationBtn").addEventListener("click", () => {
  const status = document.getElementById("reqLocStatus");
  if (!navigator.geolocation) {
    alert("Geolocation is not supported by this browser.");
    return;
  }
  status.textContent = "Locating…";
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      document.getElementById("reqLat").value = pos.coords.latitude.toFixed(6);
      document.getElementById("reqLng").value = pos.coords.longitude.toFixed(6);
      status.textContent = "Location set ✓";
      status.className = "msg success";
    },
    () => {
      status.textContent = "Could not fetch location — try again.";
      status.className = "msg error";
    }
  );
});

searchForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  resultsEl.innerHTML = `<p class="empty-state">Searching…</p>`;

  const payload = {
    bloodType: document.getElementById("reqBloodType").value,
    urgency: document.getElementById("reqUrgency").value,
    lat: parseFloat(document.getElementById("reqLat").value),
    lng: parseFloat(document.getElementById("reqLng").value),
    radiusKm: parseFloat(radiusInput.value),
    topK: 10,
  };

  try {
    const res = await fetch(`${API}/api/emergency-search`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    renderResults(data.matches, payload.bloodType, data.expandedSearch, payload.radiusKm);
  } catch (err) {
    resultsEl.innerHTML = `<p class="empty-state">Could not reach the server. Is the backend running?</p>`;
  }
});

function renderResults(matches, bloodType, expandedSearch, chosenRadius) {
  if (!matches || matches.length === 0) {
    resultsEl.innerHTML = `<p class="empty-state">No compatible, eligible ${bloodType} donors are registered yet. Encourage someone nearby to register!</p>`;
    return;
  }

  const banner = expandedSearch
    ? `<p class="expanded-note">No one was within ${chosenRadius} km, so we widened the search automatically — showing the nearest real match instead.</p>`
    : "";

  resultsEl.innerHTML =
    banner +
    matches
      .map(
        (m, i) => `
    <div class="result-card ${m.outsideChosenRadius ? "outside-radius" : ""}">
      <div>
        <span class="rank-badge">#${i + 1}</span>
        <span class="name">${m.name}</span>
        <div class="meta">${m.bloodType} donor · ${m.phone} · ${m.donationCount || 0} past donations</div>
        ${m.outsideChosenRadius ? `<div class="meta outside-tag">Outside your ${chosenRadius} km radius</div>` : ""}
      </div>
      <div class="distance">${m.distanceKm} km<br/><span style="color:#6B7278">score ${m.score.toFixed(2)}</span></div>
    </div>`
      )
      .join("");
}

// ---------------------------------------------------------------------
// Donor registration
// ---------------------------------------------------------------------
const donorForm = document.getElementById("donorForm");
const registerMsg = document.getElementById("registerMsg");

document.getElementById("useDonorLocationBtn").addEventListener("click", () => {
  const status = document.getElementById("donorLocStatus");
  if (!navigator.geolocation) {
    alert("Geolocation is not supported by this browser.");
    return;
  }
  status.textContent = "Locating…";
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      document.getElementById("donorLat").value = pos.coords.latitude.toFixed(6);
      document.getElementById("donorLng").value = pos.coords.longitude.toFixed(6);
      status.textContent = "Location set ✓";
      status.className = "msg success";
    },
    () => {
      status.textContent = "Could not fetch location — try again.";
      status.className = "msg error";
    }
  );
});

donorForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!document.getElementById("donorLat").value) {
    registerMsg.textContent = "Please set your location first using the button above.";
    registerMsg.className = "msg error";
    return;
  }
  const payload = {
    name: document.getElementById("donorName").value,
    bloodType: document.getElementById("donorBloodType").value,
    phone: document.getElementById("donorPhone").value,
    lat: parseFloat(document.getElementById("donorLat").value),
    lng: parseFloat(document.getElementById("donorLng").value),
  };
  try {
    const res = await fetch(`${API}/api/donors`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error("Registration failed");
    registerMsg.textContent = "Registered! Thank you for becoming a donor.";
    registerMsg.className = "msg success";
    donorForm.reset();
    loadDonors();
  } catch (err) {
    registerMsg.textContent = "Something went wrong. Please check your input.";
    registerMsg.className = "msg error";
  }
});

// ---------------------------------------------------------------------
// Donor pool list
// ---------------------------------------------------------------------
// Note: this list is intentionally anonymized (see GET /api/donors on the
// backend). Real names and phone numbers only ever appear in emergency
// search RESULTS — i.e. to someone who has a genuine compatible match —
// never in this general public browsing list.
async function loadDonors() {
  const donorListEl = document.getElementById("donorList");
  try {
    const res = await fetch(`${API}/api/donors`);
    const donors = await res.json();

    if (donors.length === 0) {
      donorListEl.innerHTML = `<p class="empty-state">No donors registered yet — be the first!</p>`;
      return;
    }

    donorListEl.innerHTML = donors
      .map((d, i) => {
        let statusClass = "unavailable";
        let statusText = "Unavailable";
        if (d.available && d.eligible) { statusClass = "available"; statusText = "Available"; }
        else if (d.available && !d.eligible) { statusClass = "resting"; statusText = "Resting"; }

        return `
      <div class="donor-row" style="animation-delay:${Math.min(i * 40, 400)}ms">
        <div class="type-badge">${d.bloodType}</div>
        <span class="status-pill ${statusClass}">${statusText}</span>
        <span class="anon-id">${d.anonId}</span>
      </div>`;
      })
      .join("");
  } catch (err) {
    donorListEl.innerHTML = `<p class="empty-state">Could not load donor list.</p>`;
  }
}

loadDonors();
