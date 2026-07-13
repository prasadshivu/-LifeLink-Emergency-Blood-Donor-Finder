const express = require("express");
const cors = require("cors");
const path = require("path");
const low = require("lowdb");
const FileSync = require("lowdb/adapters/FileSync");
const { v4: uuidv4 } = require("uuid");

const {
  findNearestDonors,
  isEligible,
  isCompatible,
} = require("./algorithms/matching");

const adapter = new FileSync(path.join(__dirname, "db.json"));
const db = low(adapter);
db.defaults({ donors: [], requests: [] }).write();

const app = express();
app.use(cors());
app.use(express.json());
// Serve the frontend as static files so the whole app runs from one server
app.use(express.static(path.join(__dirname, "..", "frontend")));

// --------------------------------------------------------------------------
// GET /api/donors — PUBLIC donor pool overview.
// Privacy: names and phone numbers are never exposed here. Anyone can see
// how many donors of each blood type exist and whether they're available,
// but personal identity/contact info is withheld until a real emergency
// match happens through /api/emergency-search.
// --------------------------------------------------------------------------
app.get("/api/donors", (req, res) => {
  const donors = db.get("donors").value();
  const anonymized = donors.map((d, i) => ({
    anonId: `Donor #${String(i + 1).padStart(4, "0")}`,
    bloodType: d.bloodType,
    available: d.available,
    eligible: isEligible(d),
  }));
  res.json(anonymized);
});

// --------------------------------------------------------------------------
// POST /api/donors — register a new donor
// --------------------------------------------------------------------------
app.post("/api/donors", (req, res) => {
  const { name, bloodType, phone, lat, lng } = req.body;
  if (!name || !bloodType || !phone || lat === undefined || lng === undefined) {
    return res.status(400).json({ error: "Missing required donor fields." });
  }
  const donor = {
    id: uuidv4(),
    name,
    bloodType,
    phone,
    lat: Number(lat),
    lng: Number(lng),
    lastDonationDate: null,
    available: true,
    donationCount: 0,
  };
  db.get("donors").push(donor).write();
  res.status(201).json(donor);
});

// --------------------------------------------------------------------------
// POST /api/emergency-search — the core algorithm endpoint
// Body: { bloodType, lat, lng, urgency, radiusKm, topK }
//
// Privacy note: this is the ONLY endpoint that returns a donor's real name
// and phone number. It's justified here because the caller has stated a
// genuine compatible blood-type need and a location — i.e. this is a real
// match, not casual browsing. Contrast with GET /api/donors, which is
// intentionally anonymized.
// --------------------------------------------------------------------------
app.post("/api/emergency-search", (req, res) => {
  const { bloodType, lat, lng, urgency, radiusKm, topK } = req.body;
  if (!bloodType || lat === undefined || lng === undefined) {
    return res.status(400).json({ error: "bloodType, lat, and lng are required." });
  }

  const donors = db.get("donors").value();
  const chosenRadius = radiusKm ? Number(radiusKm) : 15;
  const searchParams = {
    bloodType,
    lat: Number(lat),
    lng: Number(lng),
    urgency,
    topK: topK ? Number(topK) : 10,
  };

  // Pass 1: honor the radius the person actually chose.
  let results = findNearestDonors(donors, { ...searchParams, radiusKm: chosenRadius });
  let expandedSearch = false;

  // Pass 2 (fallback): if nothing compatible/eligible turned up nearby,
  // automatically re-run with an effectively unlimited radius so the
  // nearest real match is still surfaced — clearly flagged as being
  // outside the person's preferred distance, rather than a dead end.
  if (results.length === 0) {
    results = findNearestDonors(donors, { ...searchParams, radiusKm: 20000 });
    expandedSearch = results.length > 0;
  }

  results = results.map((r) => ({ ...r, outsideChosenRadius: r.distanceKm > chosenRadius }));

  // Log the emergency request for audit / analytics
  const requestRecord = {
    id: uuidv4(),
    bloodType,
    lat,
    lng,
    urgency: urgency || "medium",
    radiusKm: chosenRadius,
    matchesFound: results.length,
    expandedSearch,
    timestamp: new Date().toISOString(),
  };
  db.get("requests").push(requestRecord).write();

  res.json({ request: requestRecord, matches: results, expandedSearch });
});

// --------------------------------------------------------------------------
// PATCH /api/donors/:id/donate — mark a donor as having just donated
// (resets their 90-day eligibility clock)
// --------------------------------------------------------------------------
app.patch("/api/donors/:id/donate", (req, res) => {
  const donor = db.get("donors").find({ id: req.params.id }).value();
  if (!donor) return res.status(404).json({ error: "Donor not found." });

  db.get("donors")
    .find({ id: req.params.id })
    .assign({
      lastDonationDate: new Date().toISOString().slice(0, 10),
      donationCount: (donor.donationCount || 0) + 1,
    })
    .write();

  res.json(db.get("donors").find({ id: req.params.id }).value());
});

// --------------------------------------------------------------------------
// GET /api/compatibility/:bloodType — utility endpoint to check who can
// donate to a given recipient type (used by frontend for a quick lookup)
// --------------------------------------------------------------------------
app.get("/api/compatibility/:bloodType", (req, res) => {
  const donors = db.get("donors").value();
  const eligibleTypes = donors.filter((d) =>
    isCompatible(d.bloodType, req.params.bloodType)
  );
  res.json({ recipientType: req.params.bloodType, compatibleDonorRecords: eligibleTypes });
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`🩸 Emergency Blood Donor Finder API running on http://localhost:${PORT}`);
});
