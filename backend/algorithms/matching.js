/**
 * ==========================================================================
 * EMERGENCY BLOOD DONOR FINDER — CORE MATCHING ALGORITHMS
 * ==========================================================================
 * This file contains the three algorithmic building blocks of the system:
 *
 *   1. Haversine Formula        -> real-world distance between two GPS points
 *   2. Blood Compatibility Graph-> which donor types can legally donate to
 *                                  which recipient types
 *   3. Min-Heap Top-K Search    -> efficiently finds the K nearest eligible
 *                                  donors out of N donors in O(N log K)
 *                                  instead of O(N log N) full sort
 *   4. Weighted Ranking Score   -> combines distance + urgency + donor
 *                                  reliability into a single priority score
 * ==========================================================================
 */

// --------------------------------------------------------------------------
// 1. HAVERSINE DISTANCE FORMULA
// --------------------------------------------------------------------------
// Calculates the great-circle distance (in km) between two lat/lng points
// on Earth's surface. This is more accurate than Euclidean distance because
// it accounts for the Earth's curvature.
const EARTH_RADIUS_KM = 6371;

function toRadians(deg) {
  return (deg * Math.PI) / 180;
}

function haversineDistanceKm(lat1, lon1, lat2, lon2) {
  const dLat = toRadians(lat2 - lat1);
  const dLon = toRadians(lon2 - lon1);

  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRadians(lat1)) *
      Math.cos(toRadians(lat2)) *
      Math.sin(dLon / 2) ** 2;

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return EARTH_RADIUS_KM * c;
}

// --------------------------------------------------------------------------
// 2. BLOOD COMPATIBILITY GRAPH
// --------------------------------------------------------------------------
// Modeled as an adjacency list: for each recipient type, list which donor
// types are compatible. This is medically accurate for whole-blood donation.
const COMPATIBILITY = {
  "O-":  ["O-"],
  "O+":  ["O-", "O+"],
  "A-":  ["O-", "A-"],
  "A+":  ["O-", "O+", "A-", "A+"],
  "B-":  ["O-", "B-"],
  "B+":  ["O-", "O+", "B-", "B+"],
  "AB-": ["O-", "A-", "B-", "AB-"],
  "AB+": ["O-", "O+", "A-", "A+", "B-", "B+", "AB-", "AB+"], // universal recipient
};

function isCompatible(donorType, recipientType) {
  const compatibleDonors = COMPATIBILITY[recipientType];
  if (!compatibleDonors) return false;
  return compatibleDonors.includes(donorType);
}

// --------------------------------------------------------------------------
// 3. DONOR ELIGIBILITY CHECK
// --------------------------------------------------------------------------
// A donor must wait a minimum number of days between whole-blood donations
// (medical safety rule). Default: 90 days.
const MIN_DAYS_BETWEEN_DONATIONS = 90;

function isEligible(donor, today = new Date()) {
  if (!donor.available) return false;
  if (!donor.lastDonationDate) return true; // never donated -> eligible
  const last = new Date(donor.lastDonationDate);
  const diffDays = (today - last) / (1000 * 60 * 60 * 24);
  return diffDays >= MIN_DAYS_BETWEEN_DONATIONS;
}

// --------------------------------------------------------------------------
// 4. WEIGHTED PRIORITY SCORE
// --------------------------------------------------------------------------
// Lower score = better match. Combines:
//   - distance (closer is better)
//   - urgency multiplier (critical requests shrink the "acceptable radius")
//   - donor reliability (past successful donations reduce score slightly)
function computeScore(distanceKm, urgency, donor) {
  const urgencyWeight = { low: 1.0, medium: 0.85, high: 0.6, critical: 0.35 };
  const reliabilityBonus = Math.min(donor.donationCount || 0, 10) * 0.05;
  const weight = urgencyWeight[urgency] || 1.0;
  return distanceKm * weight - reliabilityBonus;
}

// --------------------------------------------------------------------------
// 5. MIN-HEAP (BINARY HEAP) — for efficient Top-K nearest donor search
// --------------------------------------------------------------------------
// Instead of sorting the entire donor list (O(N log N)) when we only need
// the top K closest matches, we maintain a heap of size K in O(N log K).
class MinHeap {
  constructor(compareFn) {
    this.data = [];
    this.compare = compareFn; // returns negative if a should be "smaller"
  }

  size() {
    return this.data.length;
  }

  peek() {
    return this.data[0];
  }

  push(item) {
    this.data.push(item);
    this._bubbleUp(this.data.length - 1);
  }

  pop() {
    const top = this.data[0];
    const last = this.data.pop();
    if (this.data.length > 0) {
      this.data[0] = last;
      this._bubbleDown(0);
    }
    return top;
  }

  toSortedArray() {
    return [...this.data].sort(this.compare);
  }

  _bubbleUp(idx) {
    while (idx > 0) {
      const parent = Math.floor((idx - 1) / 2);
      if (this.compare(this.data[idx], this.data[parent]) < 0) {
        [this.data[idx], this.data[parent]] = [this.data[parent], this.data[idx]];
        idx = parent;
      } else break;
    }
  }

  _bubbleDown(idx) {
    const n = this.data.length;
    while (true) {
      let smallest = idx;
      const left = 2 * idx + 1;
      const right = 2 * idx + 2;
      if (left < n && this.compare(this.data[left], this.data[smallest]) < 0) smallest = left;
      if (right < n && this.compare(this.data[right], this.data[smallest]) < 0) smallest = right;
      if (smallest === idx) break;
      [this.data[idx], this.data[smallest]] = [this.data[smallest], this.data[idx]];
      idx = smallest;
    }
  }
}

// --------------------------------------------------------------------------
// 6. MAIN SEARCH FUNCTION — ties everything together
// --------------------------------------------------------------------------
/**
 * findNearestDonors
 * @param {Array} donors - all donors in the system
 * @param {Object} request - { bloodType, lat, lng, urgency, radiusKm, topK }
 * @returns {Array} ranked list of matching donors with distance + score
 */
function findNearestDonors(donors, request) {
  const {
    bloodType,
    lat,
    lng,
    urgency = "medium",
    radiusKm = 15,
    topK = 10,
  } = request;

  // Max-heap by score (we keep the K best/smallest scores, so we pop the
  // current worst (largest score) when the heap overflows K).
  const heap = new MinHeap((a, b) => b.score - a.score); // acts as max-heap

  for (const donor of donors) {
    if (!isCompatible(donor.bloodType, bloodType)) continue;
    if (!isEligible(donor)) continue;

    const distanceKm = haversineDistanceKm(lat, lng, donor.lat, donor.lng);
    if (distanceKm > radiusKm) continue;

    const score = computeScore(distanceKm, urgency, donor);
    const candidate = { ...donor, distanceKm: Math.round(distanceKm * 100) / 100, score };

    if (heap.size() < topK) {
      heap.push(candidate);
    } else if (candidate.score < heap.peek().score) {
      heap.pop();
      heap.push(candidate);
    }
  }

  // Sort ascending by score (best match first) for final output
  return heap.toSortedArray().sort((a, b) => a.score - b.score);
}

module.exports = {
  haversineDistanceKm,
  isCompatible,
  isEligible,
  computeScore,
  findNearestDonors,
  MinHeap,
  COMPATIBILITY,
  MIN_DAYS_BETWEEN_DONATIONS,
};
