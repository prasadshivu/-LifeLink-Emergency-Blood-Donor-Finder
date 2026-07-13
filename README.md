
# 🩸 LifeLink — Emergency Blood Donor Finder

A full-stack web application that connects patients in urgent need of blood
with nearby, compatible, eligible donors — ranked by an algorithm that
combines geolocation distance, blood-type compatibility, medical eligibility,
and request urgency.
🔗 **Live Demo:** https://lifelink-emergency-blood-donor-finder.onrender.com

---

## 1. Tech Stack

| Layer     | Technology                                  |
|-----------|----------------------------------------------|
| Frontend  | HTML5, CSS3, Vanilla JavaScript (Fetch API, Geolocation API) |
| Backend   | Node.js, Express.js                          |
| Database  | lowdb (lightweight JSON-file database — swappable for MongoDB/PostgreSQL) |
| Core logic| Custom algorithms in `backend/algorithms/matching.js` |

---

## 2. Project Structure

```
blood-donor-finder/
├── backend/
│   ├── algorithms/
│   │   └── matching.js      # Haversine, compatibility graph, min-heap, scoring
│   ├── server.js            # Express API + serves the frontend
│   ├── db.json              # Seed data (8 sample donors)
│   └── package.json
├── frontend/
│   ├── index.html
│   ├── css/style.css
│   └── js/app.js
└── README.md
```

---

## 3. How to Run

```bash
cd backend
npm install
npm start
```

Then open **http://localhost:4000** in your browser. The Express server
serves both the API and the frontend, so there's nothing else to configure.

---

## 4. Algorithms Used (this is the core of the project)

### 4.1 Haversine Distance Formula — geolocation search
Calculates real-world distance between the patient and every donor using
their latitude/longitude, accounting for the Earth's curvature:

```
a = sin²(Δlat/2) + cos(lat1)·cos(lat2)·sin²(Δlng/2)
c = 2·atan2(√a, √(1−a))
distance = R · c        (R = 6371 km)
```

This is more accurate than flat Euclidean distance for any real-world
mapping use case.

### 4.2 Blood Compatibility Graph
Blood donation compatibility is modeled as a directed graph / adjacency
list — for each recipient type, the set of donor types that can safely
donate to them (e.g. `O-` is the universal donor, `AB+` is the universal
recipient). Lookup is O(1).

### 4.3 Donor Eligibility Rule
A donor is only eligible if they've waited at least **90 days** since their
last donation — a real medical safety constraint, checked with simple date
arithmetic.

### 4.4 Weighted Priority Scoring
Each valid candidate gets a score:

```
score = distance_km × urgency_weight − reliability_bonus
```

- `urgency_weight` shrinks the effective distance penalty for critical
  cases (a "critical" request treats donors as if they were closer,
  surfacing more candidates fast).
- `reliability_bonus` slightly favors donors with a track record of past
  donations.

Lower score = better match.

### 4.5 Top-K Search via Min/Max-Heap
Rather than sorting the entire donor table — O(N log N) — the system
maintains a **bounded binary heap of size K**, giving O(N log K) time
complexity to find the K best matches. This matters at scale: if a city has
50,000 registered donors and you only need the closest 10, the heap
approach avoids sorting all 50,000.

### 4.6 Overall Search Pipeline
```
for each donor:
    if NOT compatible(donor.type → requested.type): skip     # O(1) graph lookup
    if NOT eligible(donor):                          skip     # 90-day rule
    distance = haversine(patient, donor)
    if distance > radius: skip
    score = weighted_score(distance, urgency, donor)
    heap.pushIfBetterThanWorst(donor, score, K)
return heap sorted ascending by score
```

---

## 5. Privacy Design

Donor identity is protected by default:

- `GET /api/donors` (the public browsing list) **never** returns a donor's
  name or phone number — only an anonymized ID (`Donor #0001`), blood type,
  and availability status.
- `POST /api/emergency-search` is the **only** endpoint that reveals a
  donor's real name and phone number, and only for donors who are an actual
  compatible + eligible + in-range match for a stated request. This models
  real-world consent: a donor's contact info is disclosed only when there's
  a genuine reason to reach them, not to anyone casually browsing the pool.

This separation is enforced on the backend (`server.js`), not just hidden
in the UI — so it can't be bypassed by calling the API directly.

## 6. API Reference

| Method | Endpoint                        | Description                              |
|--------|----------------------------------|-------------------------------------------|
| GET    | `/api/donors`                    | List all donors                           |
| POST   | `/api/donors`                    | Register a new donor                      |
| POST   | `/api/emergency-search`          | Run the matching algorithm, get ranked donors |
| PATCH  | `/api/donors/:id/donate`         | Mark a donor as having just donated (resets 90-day clock) |
| GET    | `/api/compatibility/:bloodType`  | List donors compatible with a recipient type |

**Example: `POST /api/emergency-search`**
```json
{
  "bloodType": "O+",
  "lat": 12.9716,
  "lng": 77.5946,
  "urgency": "critical",
  "radiusKm": 15,
  "topK": 5
}
```

---

## 7. Possible Extensions (good "future work" slide for a viva/presentation)

- Replace lowdb with MongoDB/PostgreSQL + geospatial indexes (`2dsphere`) for
  production scale.
- Real SMS/push notifications to matched donors (Twilio/Firebase Cloud Messaging).
- Donor-side app to accept/decline a request, turning this into a live
  matching marketplace instead of a one-shot search.
- Blood bank inventory integration so hospitals are searched alongside
  individual donors.
- Authentication + donor verification (Aadhaar/health ID) for trust and safety.
- A map view (Leaflet/Google Maps) plotting donor pins around the request location.
=======
# -LifeLink-Emergency-Blood-Donor-Finder
>>>>>>> fa8b61932db5a5831f0fde4bebe310c5eada79ed
