import { useState, useEffect } from "react";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine, BarChart, Bar, ComposedChart, Area
} from "recharts";

// ── Energy helpers ─────────────────────────────────────────────────────────
function calcBMR(w, h, age, sex) {
  if (sex === "f") return Math.round(10 * w + 6.25 * h - 5 * age - 161);
  return Math.round(10 * w + 6.25 * h - 5 * age + 5);
}
function calcTDEE(w, h, age, sex) {
  return Math.round(calcBMR(w, h, age, sex) * 1.55);
}
function calcTEF(calories) {
  return calories ? Math.round(parseInt(calories) * 0.1) : 0;
}
function calcNEAT(steps, w) {
  if (!steps || !w) return 0;
  return Math.round(steps * 0.04 * (w / 80));
}
const GYM_KCAL_MIN = { Leicht: 3, Moderat: 4.5, Intensiv: 6, Maximal: 8 };

const SPORT_OPTIONS = [
  { label:"🏊 Schwimmen",     met: 6.0, spm: 0   },
  { label:"🏃 Joggen",        met: 7.5, spm: 150 },
  { label:"⚽ Fussball",      met: 7.0, spm: 100 },
  { label:"🚴 Velofahren",    met: 6.0, spm: 0   },
  { label:"🏀 Basketball",    met: 6.5, spm: 110 },
  { label:"🎾 Tennis",        met: 6.0, spm: 80  },
  { label:"🥊 Boxen",         met: 9.0, spm: 60  },
  { label:"⛷️ Skifahren",     met: 5.5, spm: 0   },
  { label:"🧘 Yoga",          met: 2.5, spm: 0   },
  { label:"🏋️ Crossfit",      met: 8.0, spm: 50  },
  { label:"🚣 Rudern",        met: 6.5, spm: 0   },
  { label:"💃 Tanzen",        met: 4.5, spm: 60  },
  { label:"🥋 Kampfsport",    met: 7.5, spm: 70  },
  { label:"🏐 Volleyball",    met: 4.5, spm: 80  },
  { label:"❄️ Eislaufen",     met: 5.5, spm: 0   },
  { label:"✏️ Anderes",       met: null, spm: 0  },
];

function calcSportSteps(spm, duration) {
  if (!spm || !duration) return 0;
  return Math.round(spm * parseFloat(duration));
}

// Net EAT: (MET-1) × weight × hours — subtracts resting BMR already in TEE
function calcSportEAT(met, duration, w) {
  if (!met || !duration || !w) return 0;
  return Math.round(Math.max(0, (parseFloat(met) - 1) * parseFloat(w) * (parseFloat(duration) / 60)));
}
function calcGymEAT(duration, intensity, w) {
  if (!duration) return 0;
  return Math.round((GYM_KCAL_MIN[intensity] || 4.5) * parseFloat(duration) * (parseFloat(w || 80) / 80));
}
function calcWalkEAT(speed, incline, duration, w) {
  if (!speed || !duration || !w) return 0;
  const met = 0.1 * parseFloat(speed) + 1.8 * parseFloat(speed) * (parseFloat(incline || 0) / 100) + 3.5;
  return Math.round(met * parseFloat(w) * (parseFloat(duration) / 60));
}
function calcTEE(log, fallbackW, profile) {
  const w   = log?.weight ? parseFloat(log.weight) : (fallbackW || parseFloat(profile?.startWeight || 80));
  const h   = parseFloat(profile?.height || 175);
  const age = parseInt(profile?.age || 30);
  const sex = profile?.sex || "m";
  const bmr = calcBMR(w, h, age, sex);
  const ws    = log?.walking?.active ? calcWalkingSteps(log.walking.speed, log.walking.duration) : 0;
  const ss    = log?.sport?.active ? calcSportSteps(parseFloat(log.sport.spm||0), log.sport.duration) : 0;
  const real  = log?.steps ? Math.max(0, parseInt(log.steps) - ws - ss) : 0;
  const neat  = calcNEAT(real, w);
  const gym   = log?.gym?.active ? calcGymEAT(log.gym.duration, log.gym.intensity, w) : 0;
  const walk  = log?.walking?.active ? calcWalkEAT(log.walking.speed, log.walking.incline, log.walking.duration, w) : 0;
  const sport = log?.sport?.active ? calcSportEAT(parseFloat(log.sport.met), log.sport.duration, w) : 0;
  const tef   = calcTEF(log?.calories);
  return { total: bmr + neat + gym + walk + sport + tef, bmr, neat, gym, walk, sport, tef };
}
function calcWeeklyTDEE(logEntries, currentWeight, profile) {
  const recent = logEntries.slice(-7);
  if (recent.length === 0) return calcTDEE(currentWeight, parseFloat(profile?.height || 175), parseInt(profile?.age || 30), profile?.sex || "m");
  return Math.round(recent.reduce((s, l) => s + calcTEE(l, currentWeight, profile).total, 0) / recent.length);
}
function calcWalkingSteps(speed, duration) {
  if (!speed || !duration) return 0;
  return Math.round((parseFloat(speed) * parseFloat(duration) * 1000 / 60) / 0.75);
}
function getTodayStr() { return new Date().toISOString().split("T")[0]; }
function getDaysLeft(endDate) {
  const now = new Date(); now.setHours(0,0,0,0);
  const end = new Date(endDate); end.setHours(0,0,0,0);
  return Math.max(0, Math.round((end - now) / 86400000));
}
function getTotalDays(startDate, endDate) {
  return Math.round((new Date(endDate) - new Date(startDate)) / 86400000);
}
function getGoalWeightForDay(day, totalDays, startWeight, goalWeight) {
  return startWeight - ((startWeight - goalWeight) / totalDays) * day;
}
function dateToLabel(dateStr, startDate) {
  const diff = Math.round((new Date(dateStr) - new Date(startDate)) / 86400000);
  return `W${Math.floor(diff / 7) + 1}`;
}

const INTENSITY_LEVELS = ["Leicht", "Moderat", "Intensiv", "Maximal"];
const INTENSITY_COLORS = ["#4caf82", "#ffb347", "#ff6b2b", "#ff2244"];
const defaultForm = {
  weight: "", calories: "", steps: "",
  gym:     { active: false, duration: "", intensity: "", exercises: "" },
  walking: { active: false, duration: "", speed: "", incline: "", avgHr: "" },
  sport:   { active: false, type: "", customName: "", duration: "", met: null, spm: 0 }
};
const defaultProfile = {
  name: "", sex: "m", age: "", height: "", startWeight: "", goalWeight: "",
  startDate: getTodayStr(), endDate: "", calorieTarget: "", stepTarget: "",
  gymSessionsPerWeek: "3", gymDuration: "60", gymIntensity: "Moderat",
  walkSessionsPerWeek: "3", walkDuration: "25", walkSpeed: "5", walkIncline: "10"
};

// Calculate planned daily TDEE from profile activity settings
function calcPlannedTDEE(sf) {
  if (!sf.age || !sf.height || !sf.startWeight) return null;
  const w = parseFloat(sf.startWeight);
  const bmr = calcBMR(w, parseFloat(sf.height), parseInt(sf.age), sf.sex);
  // NEAT from planned steps
  const neat = sf.stepTarget ? calcNEAT(parseInt(sf.stepTarget), w) : 0;
  // EAT gym: sessions/week × duration × intensity → per day
  const gymPerDay = sf.gymSessionsPerWeek && sf.gymDuration
    ? (parseFloat(sf.gymSessionsPerWeek) / 7) * calcGymEAT(sf.gymDuration, sf.gymIntensity, w) : 0;
  // EAT walking: sessions/week × duration/speed/incline → per day
  const walkPerDay = sf.walkSessionsPerWeek && sf.walkDuration && sf.walkSpeed
    ? (parseFloat(sf.walkSessionsPerWeek) / 7) * calcWalkEAT(sf.walkSpeed, sf.walkIncline, sf.walkDuration, w) : 0;
  // TEF from planned calories (if set)
  const tef = sf.calorieTarget ? calcTEF(sf.calorieTarget) : Math.round(bmr * 0.1);
  const total = Math.round(bmr + neat + gymPerDay + walkPerDay + tef);
  return { total, bmr, neat: Math.round(neat), gym: Math.round(gymPerDay), walk: Math.round(walkPerDay), tef };
}

// ══════════════════════════════════════════════════════════════════════════
export default function App() {
  const [logs, setLogs]         = useState({});
  const [profile, setProfile]   = useState(null);
  const [tab, setTab]           = useState("dashboard");
  const [form, setForm]         = useState(defaultForm);
  const [saved, setSaved]       = useState(false);
  const [loading, setLoading]   = useState(true);
  const [editDate, setEditDate] = useState(null);
  const [setupForm, setSetupForm] = useState(defaultProfile);
  const [recovering, setRecovering] = useState(false);
  const [recoveryMsg, setRecoveryMsg] = useState("");
  const [setupStep, setSetupStep] = useState(0); // 0=personal, 1=goals
  const today = getTodayStr();
  const activeDate = editDate || today;

  useEffect(() => {
    try {
      const p = localStorage.getItem("challenge-profile");
      if (p) setProfile(JSON.parse(p));
      const r = localStorage.getItem("challenge-logs-v2");
      if (r) setLogs(JSON.parse(r));
    } catch (e) {}
    setLoading(false);
  }, []);

  useEffect(() => {
    if (loading) return;
    // On initial load only: populate form with today's data if exists
    if (logs[activeDate]) setForm({ ...defaultForm, ...logs[activeDate] });
  }, [loading]);

  const setGym     = (f, v) => setForm(p => ({ ...p, gym:     { ...p.gym,     [f]: v } }));
  const setWalking = (f, v) => setForm(p => ({ ...p, walking: { ...p.walking, [f]: v } }));
  const setSport   = (f, v) => setForm(p => ({ ...p, sport:   { ...p.sport,   [f]: v } }));

  function tryRecoverData() {
    setRecovering(true);
    setRecoveryMsg("Suche...");
    let found = false;
    const profileKeys = ["challenge-profile"];
    const logsKeys = ["challenge-logs-v2", "challenge-logs", "challenge-logs-v1"];
    for (const key of profileKeys) {
      try {
        const ls = localStorage.getItem(key);
        if (ls) { setProfile(JSON.parse(ls)); found = true; break; }
      } catch (e) {}
    }
    for (const key of logsKeys) {
      try {
        const ls = localStorage.getItem(key);
        if (ls) { setLogs(JSON.parse(ls)); break; }
      } catch (e) {}
    }
    setRecoveryMsg(found ? "✓ Daten gefunden!" : "Keine gespeicherten Daten gefunden.");
    setRecovering(false);
  }

  function saveProfile() {
    try { localStorage.setItem("challenge-profile", JSON.stringify(setupForm)); } catch (e) {}
    setProfile(setupForm);
  }

  function exportReport() {
    if (logEntries.length === 0) { alert("Keine Daten zum Exportieren."); return; }
    const rows = [...logEntries].reverse();

    // ── CSV ──
    const headers = ["Datum","Gewicht (kg)","Kalorien","Schritte (echt)","TEE","Defizit","Gym","Gym Dauer","Gym Intensität","Notizen","Walking","Dauer","Speed","Steigung","Puls"];
    const csvLines = [headers.join(",")];
    rows.forEach(log => {
      const ws = log.walking && log.walking.active ? calcWalkingSteps(log.walking.speed, log.walking.duration) : 0;
      const ss = log.sport?.active ? calcSportSteps(parseFloat(log.sport?.spm||0), log.sport?.duration) : 0;
      const rs = log.steps ? Math.max(0, parseInt(log.steps) - ws - ss) : "";
      const tee = calcTEE(log, currentWeight, profile);
      const def = log.calories ? tee.total - parseInt(log.calories) : "";
      csvLines.push([
        log.date, log.weight||"", log.calories||"", rs,
        log.calories ? tee.total : "", def,
        log.gym && log.gym.active ? "Ja" : "Nein",
        (log.gym && log.gym.duration)||"", (log.gym && log.gym.intensity)||"", (log.gym && log.gym.exercises)||"",
        log.walking && log.walking.active ? "Ja" : "Nein",
        (log.walking && log.walking.duration)||"", (log.walking && log.walking.speed)||"",
        (log.walking && log.walking.incline)||"", (log.walking && log.walking.avgHr)||""
      ].map(v => '"' + String(v).replace(/"/g,'""') + '"').join(","));
    });
    const csv = csvLines.join("\r\n");
    const csvBlob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const csvUrl = URL.createObjectURL(csvBlob);
    const ca = document.createElement("a");
    ca.href = csvUrl; ca.download = "challenge-daten-" + today + ".csv";
    document.body.appendChild(ca); ca.click();
    document.body.removeChild(ca); URL.revokeObjectURL(csvUrl);

    // ── HTML ──
    const pName = (profile && profile.name) ? profile.name : "Body Challenge";
    const startBMR = calcBMR(START_WEIGHT, parseFloat(profile.height), parseInt(profile.age), profile.sex);
    const goalBMR  = calcBMR(GOAL_WEIGHT,  parseFloat(profile.height), parseInt(profile.age), profile.sex);

    const statCard = (label, val, sub, color) =>
      '<div class="sc"><div class="sl">' + label + '</div><div class="sv" style="color:' + color + '">' + val + '</div>' + (sub ? '<div class="ss">' + sub + '</div>' : '') + '</div>';

    const tableRows = rows.map(log => {
      const ws = log.walking && log.walking.active ? calcWalkingSteps(log.walking.speed, log.walking.duration) : 0;
      const rs = log.steps ? Math.max(0, parseInt(log.steps) - ws) : null;
      const tee = calcTEE(log, currentWeight, profile);
      const def = log.calories ? tee.total - parseInt(log.calories) : null;
      const defColor = def > 0 ? "#4caf82" : "#ff4444";
      const kcalColor = log.calories <= CALORIE_TARGET ? "#4caf82" : "#ff4444";
      const stepsColor = rs >= STEP_TARGET ? "#4caf82" : "#888";
      const gymBadge = log.gym && log.gym.active
        ? '<span class="bg bg-g">Gym' + (log.gym.duration ? " " + log.gym.duration + "min" : "") + (log.gym.intensity ? " · " + log.gym.intensity : "") + "</span>" : "";
      const walkBadge = log.walking && log.walking.active
        ? '<span class="bg bg-w">Walking' + (log.walking.speed ? " " + log.walking.speed + "km/h" : "") + (log.walking.incline ? " " + log.walking.incline + "%" : "") + "</span>" : "";
      return '<tr>'
        + '<td>' + log.date + '</td>'
        + '<td style="color:#ff6b2b">' + (log.weight ? log.weight + " kg" : "—") + '</td>'
        + '<td style="color:' + kcalColor + '">' + (log.calories || "—") + '</td>'
        + '<td style="color:#ffb347">' + (log.calories ? tee.total : "—") + '</td>'
        + '<td style="color:' + defColor + '">' + (def !== null ? (def > 0 ? "+" : "") + def : "—") + '</td>'
        + '<td style="color:' + stepsColor + '">' + (rs !== null ? rs.toLocaleString("de-CH") : "—") + '</td>'
        + '<td>' + (gymBadge + " " + walkBadge || "—") + '</td>'
        + '</tr>';
    }).join("");

    const html = '<!DOCTYPE html><html lang="de"><head><meta charset="UTF-8">'
      + '<title>' + pName + ' – Bericht</title>'
      + '<style>'
      + 'body{font-family:system-ui,sans-serif;background:#0a0a0a;color:#f0f0f0;margin:0;padding:24px;}'
      + 'h1{color:#ff6b2b;font-size:26px;letter-spacing:3px;margin-bottom:4px;}'
      + 'h2{color:#ff6b2b;font-size:12px;letter-spacing:2px;margin:24px 0 10px;border-bottom:1px solid #222;padding-bottom:6px;}'
      + '.sub{color:#555;font-size:11px;letter-spacing:2px;margin-bottom:20px;}'
      + '.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(130px,1fr));gap:10px;margin-bottom:16px;}'
      + '.sc{background:#111;border:1px solid #1e1e1e;border-radius:8px;padding:12px;}'
      + '.sl{font-size:9px;color:#555;letter-spacing:2px;margin-bottom:4px;text-transform:uppercase;}'
      + '.sv{font-size:22px;font-weight:700;}'
      + '.ss{font-size:10px;color:#555;margin-top:2px;}'
      + 'table{width:100%;border-collapse:collapse;font-size:11px;}'
      + 'th{background:#161616;color:#555;padding:8px 10px;text-align:left;font-size:9px;letter-spacing:1px;border-bottom:1px solid #222;}'
      + 'td{padding:8px 10px;border-bottom:1px solid #1a1a1a;color:#888;}'
      + 'tr:hover td{background:#111;}'
      + '.bg{display:inline-block;padding:2px 7px;border-radius:10px;font-size:9px;margin-right:4px;}'
      + '.bg-g{background:#ff6b2b22;color:#ff6b2b;border:1px solid #ff6b2b44;}'
      + '.bg-w{background:#ffb34722;color:#ffb347;border:1px solid #ffb34744;}'
      + 'footer{margin-top:30px;font-size:10px;color:#444;text-align:center;}'
      + '</style></head><body>'
      + '<h1>BODY CHALLENGE BERICHT</h1>'
      + '<div class="sub">' + pName + ' · ' + START_DATE + ' → ' + END_DATE + ' · Export: ' + new Date().toLocaleDateString("de-CH") + '</div>'
      + '<h2>ÜBERSICHT</h2>'
      + '<div class="grid">'
      + statCard("Startgewicht", START_WEIGHT + " kg", "", "#888")
      + statCard("Aktuell", currentWeight + " kg", "", "#ff6b2b")
      + statCard("Verloren", "-" + lostSoFar + " kg", "", "#4caf82")
      + statCard("Ziel", GOAL_WEIGHT + " kg", "", "#555")
      + statCard("Fortschritt", progressPct + "%", "zum Ziel", "#ff6b2b")
      + statCard("Gesamtdefizit", "+" + Math.round(totalCumDeficit/1000*10)/10 + "k", "kcal", "#4caf82")
      + statCard("Fett abgebaut", projectedFatKg + " kg", "kalkuliert", "#4caf82")
      + statCard("Ø Defizit/Tag", (avgDeficit ? "+" + avgDeficit : "—"), "kcal", avgDeficit >= 700 ? "#4caf82" : "#ffb347")
      + statCard("Ø Kalorien", (avgCalories || "—"), "kcal/Tag", "#ffb347")
      + statCard("Gym Sessions", totalWorkouts, "", "#ff6b2b")
      + statCard("Walking Sessions", totalWalking, "", "#ffb347")
      + statCard("Einträge", logEntries.length + " / " + getTotalDays(START_DATE, END_DATE), "Tage", "#888")
      + '</div>'
      + '<h2>TAGESVERLAUF</h2>'
      + '<table><thead><tr><th>Datum</th><th>Gewicht</th><th>Kcal</th><th>TEE</th><th>Defizit</th><th>Schritte ✓</th><th>Training</th></tr></thead>'
      + '<tbody>' + tableRows + '</tbody></table>'
      + '<footer>Generiert mit Body Challenge Tracker · ' + new Date().toLocaleDateString("de-CH") + '</footer>'
      + '</body></html>';

    setTimeout(() => {
      const blob = new Blob([html], { type: "text/html;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = "challenge-bericht-" + today + ".html";
      document.body.appendChild(a); a.click();
      document.body.removeChild(a); URL.revokeObjectURL(url);
    }, 400);
  }
  function saveEntry() {
    const newLogs = { ...logs, [activeDate]: { ...form, date: activeDate } };
    setLogs(newLogs);
    try { localStorage.setItem("challenge-logs-v2", JSON.stringify(newLogs)); } catch (e) {}
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  // ── Profile-derived constants ──────────────────────────────────────────
  const START_WEIGHT    = profile ? parseFloat(profile.startWeight) : 80;
  const GOAL_WEIGHT     = profile ? parseFloat(profile.goalWeight)  : 70;
  const CALORIE_TARGET  = profile ? parseInt(profile.calorieTarget) : 1700;
  const STEP_TARGET     = profile ? parseInt(profile.stepTarget)    : 10000;
  const START_DATE      = profile?.startDate || today;
  const END_DATE        = profile?.endDate   || today;
  const TOTAL_DAYS      = getTotalDays(START_DATE, END_DATE);

  // ── Derived values ─────────────────────────────────────────────────────
  const logEntries    = Object.values(logs).sort((a, b) => a.date.localeCompare(b.date));
  const latestWeight  = logEntries.filter(l => l.weight).slice(-1)[0]?.weight;
  const currentWeight = latestWeight ? parseFloat(latestWeight) : START_WEIGHT;
  const daysLeft      = getDaysLeft(END_DATE);
  const progressPct   = Math.min(100, Math.max(0, Math.round(((START_WEIGHT - currentWeight) / (START_WEIGHT - GOAL_WEIGHT)) * 100)));
  const lostSoFar     = (START_WEIGHT - currentWeight).toFixed(1);
  const remaining     = Math.max(0, currentWeight - GOAL_WEIGHT).toFixed(1);
  const totalDiff     = START_WEIGHT - GOAL_WEIGHT;
  const totalWorkouts = logEntries.filter(l => l.gym?.active).length;
  const totalWalking  = logEntries.filter(l => l.walking?.active).length;
  const weeklyTDEE    = calcWeeklyTDEE(logEntries, currentWeight, profile);
  const baseTDEE      = calcTDEE(currentWeight, parseFloat(profile?.height||175), parseInt(profile?.age||30), profile?.sex||"m");

  let totalCumDeficit = 0;
  const deficitPerDay = logEntries.filter(l => l.calories).map(l => {
    const tee     = calcTEE(l, currentWeight, profile);
    const deficit = tee.total - parseInt(l.calories);
    totalCumDeficit += deficit;
    return { date: l.date, deficit, tee: tee.total, teeData: tee, calories: parseInt(l.calories), cumDef: totalCumDeficit };
  });
  const avgCalories = logEntries.filter(l => l.calories).length
    ? Math.round(logEntries.filter(l => l.calories).reduce((s,l) => s+parseInt(l.calories),0) / logEntries.filter(l=>l.calories).length) : null;
  const avgDeficit  = deficitPerDay.length
    ? Math.round(deficitPerDay.reduce((s,d) => s+d.deficit,0) / deficitPerDay.length) : null;
  const projectedFatKg = totalCumDeficit > 0 ? (totalCumDeficit / 7700).toFixed(2) : "0";

  const todayLog       = logs[today];
  const todayTEE       = calcTEE(todayLog, currentWeight, profile);
  const todayDeficit   = todayLog?.calories ? todayTEE.total - parseInt(todayLog.calories) : null;
  const todayWalkSteps = todayLog?.walking?.active ? calcWalkingSteps(todayLog.walking.speed, todayLog.walking.duration) : 0;
  const todaySportSteps = todayLog?.sport?.active ? calcSportSteps(parseFloat(todayLog.sport.spm||0), todayLog.sport.duration) : 0;
  const todayRealSteps = todayLog?.steps ? Math.max(0, parseInt(todayLog.steps) - todayWalkSteps - todaySportSteps) : null;

  const formWalkSteps  = form.walking.active ? calcWalkingSteps(form.walking.speed, form.walking.duration) : 0;
  const formSportSteps = form.sport?.active ? calcSportSteps(parseFloat(form.sport.spm||0), form.sport.duration) : 0;
  const formRealSteps  = Math.max(0, (parseInt(form.steps) || 0) - formWalkSteps - formSportSteps);
  const formTEE       = form.weight ? calcTEE(form, parseFloat(form.weight), profile) : null;
  const formDeficit   = formTEE && form.calories ? formTEE.total - parseInt(form.calories) : null;

  const chartData = Array.from({ length: TOTAL_DAYS + 1 }, (_, i) => {
    const dateStr = new Date(new Date(START_DATE).getTime() + i * 86400000).toISOString().split("T")[0];
    const log = logs[dateStr];
    const tee = log ? calcTEE(log, currentWeight, profile) : { total: baseTDEE };
    const ws  = log?.walking?.active ? calcWalkingSteps(log.walking.speed, log.walking.duration) : 0;
    return {
      day: i, label: `W${Math.floor(i/7)+1}`, dateStr,
      goal:      parseFloat(getGoalWeightForDay(i, TOTAL_DAYS, START_WEIGHT, GOAL_WEIGHT).toFixed(1)),
      weight:    log?.weight ? parseFloat(log.weight) : null,
      calories:  log?.calories ? parseInt(log.calories) : null,
      tee:       tee.total,
      deficit:   log?.calories ? tee.total - parseInt(log.calories) : null,
      realSteps: log?.steps ? Math.max(0, parseInt(log.steps) - ws - (log?.sport?.active ? calcSportSteps(parseFloat(log.sport?.spm||0), log.sport?.duration) : 0)) : null,
    };
  });

  if (loading) return (
    <div className="app-root" style={{ display:"flex", alignItems:"center", justifyContent:"center" }}>
      <div style={{ color:"#ff6b2b", fontFamily:"monospace", fontSize:20 }}>LOADING...</div>
    </div>
  );

  // ── CSS ──────────────────────────────────────────────────────────────────
  const css = `
    @import url('https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Outfit:wght@300;400;500;600&display=swap');
    *{box-sizing:border-box;margin:0;padding:0}

    html,body{margin:0;padding:0;min-height:100%}
    .app-root{
      font-family:'Outfit',sans-serif;
      color:#f0f0f0;
      min-height:100vh;
      position:relative;
      background:
        radial-gradient(ellipse 800px 600px at 0% 0%,   #2a1200 0%, transparent 60%),
        radial-gradient(ellipse 600px 600px at 100% 0%,  #1a0800 0%, transparent 55%),
        radial-gradient(ellipse 700px 500px at 50% 100%, #0d0500 0%, transparent 60%),
        #080808;
    }
    .app-root::before{
      content:'';
      position:fixed;inset:0;
      background:
        radial-gradient(ellipse 500px 400px at 15% 25%, #ff6b2b18 0%, transparent 65%),
        radial-gradient(ellipse 400px 300px at 85% 70%, #ff4d0012 0%, transparent 60%),
        radial-gradient(ellipse 300px 200px at 50% 10%, #ff8c4d0a 0%, transparent 55%);
      pointer-events:none;z-index:0;
    }

    ::-webkit-scrollbar{width:3px}
    ::-webkit-scrollbar-thumb{background:#ff6b2b44;border-radius:4px}

    /* ── Glass Cards ── */
    .card{
      background:linear-gradient(135deg, #ffffff0f 0%, #ffffff07 100%);
      backdrop-filter:blur(24px);-webkit-backdrop-filter:blur(24px);
      border:1px solid #ffffff18;
      border-top:1px solid #ffffff28;
      border-radius:20px;
      padding:18px;
      box-shadow:0 8px 32px #0000004a, 0 1px 0 #ffffff10 inset;
      transition:border-color .25s, box-shadow .25s;
    }
    .card:hover{border-color:#ffffff25;box-shadow:0 12px 40px #0000005a, 0 1px 0 #ffffff14 inset}

    .sc{
      background:linear-gradient(135deg, #ffffff0c 0%, #ffffff05 100%);
      backdrop-filter:blur(20px);-webkit-backdrop-filter:blur(20px);
      border:1px solid #ffffff15;
      border-top:1px solid #ffffff22;
      border-radius:20px;
      padding:18px;
      box-shadow:0 4px 24px #00000033;
    }

    /* ── Header ── */
    .glass-header{
      background:linear-gradient(180deg, #ffffff0e 0%, #ffffff06 100%);
      backdrop-filter:blur(30px);-webkit-backdrop-filter:blur(30px);
      border-bottom:1px solid #ffffff12;
      box-shadow:0 1px 0 #ffffff08;
    }

    /* ── Tab Nav ── */
    .tab-scroll{
      display:flex;overflow-x:auto;-webkit-overflow-scrolling:touch;scrollbar-width:none;
      background:linear-gradient(180deg,#ffffff08,#ffffff04);
      backdrop-filter:blur(20px);-webkit-backdrop-filter:blur(20px);
      border-bottom:1px solid #ffffff0e;
    }
    .tab-scroll::-webkit-scrollbar{display:none}
    .tab-btn{
      background:none;border:none;cursor:pointer;
      padding:12px 11px;
      font-family:'Outfit',sans-serif;font-size:10px;
      letter-spacing:1.5px;text-transform:uppercase;font-weight:600;
      transition:all .2s;white-space:nowrap;flex-shrink:0;
      position:relative;
    }
    .tab-btn.active{color:#ff6b2b}
    .tab-btn.active::after{
      content:'';position:absolute;bottom:0;left:10%;right:10%;
      height:2px;background:linear-gradient(90deg,transparent,#ff6b2b,transparent);
      border-radius:2px;box-shadow:0 0 8px #ff6b2baa;
    }
    .tab-btn:not(.active){color:#ffffff44}
    .tab-btn:hover:not(.active){color:#ffffff77}

    /* ── Inputs ── */
    .inp{
      background:#ffffff09;
      backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);
      border:1px solid #ffffff18;
      border-radius:12px;color:#f0f0f0;
      padding:12px 14px;
      font-family:'Outfit',sans-serif;font-size:14px;
      width:100%;outline:none;transition:all .25s;
    }
    .inp:focus{
      border-color:#ff6b2baa;
      background:#ff6b2b0d;
      box-shadow:0 0 0 3px #ff6b2b22, 0 0 16px #ff6b2b18;
    }
    .inp::placeholder{color:#ffffff2a}
    input[type='date']{color-scheme:dark;color:#f0f0f0}
    input[type='date']::-webkit-calendar-picker-indicator{filter:invert(1) opacity(0.35);cursor:pointer}

    .sel{
      background:#ffffff09;backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);
      border:1px solid #ffffff18;border-radius:12px;color:#f0f0f0;
      padding:12px 14px;font-family:'Outfit',sans-serif;font-size:14px;
      width:100%;outline:none;appearance:none;cursor:pointer;
      transition:all .25s;
    }
    .sel:focus{border-color:#ff6b2baa;box-shadow:0 0 0 3px #ff6b2b22}

    /* ── Buttons ── */
    .save-btn{
      background:linear-gradient(135deg, #ff5500 0%, #ff7a35 50%, #ff6b2b 100%);
      border:1px solid #ff8c4d55;
      border-top:1px solid #ffaa7766;
      border-radius:14px;color:#fff;cursor:pointer;
      font-family:'Bebas Neue',sans-serif;font-size:20px;letter-spacing:3px;
      padding:15px 32px;transition:all .3s;width:100%;
      box-shadow:0 6px 28px #ff6b2b55, 0 1px 0 #ffffff22 inset;
      text-shadow:0 1px 3px #00000055;
    }
    .save-btn:hover{transform:translateY(-2px);box-shadow:0 10px 36px #ff6b2b77}
    .save-btn:active{transform:translateY(1px);box-shadow:0 3px 16px #ff6b2b44}
    .save-btn:disabled,.save-btn[style*="opacity: 0.4"]{filter:grayscale(0.5)}

    .sec-btn{
      background:#ffffff09;border:1px solid #ffffff18;
      border-radius:12px;color:#ffffff66;cursor:pointer;
      font-family:'Outfit',sans-serif;font-size:12px;font-weight:500;
      padding:11px 20px;transition:all .2s;flex:1;letter-spacing:0.5px;
    }
    .sec-btn:hover{border-color:#ff6b2b88;color:#ff6b2b}

    /* ── Toggle ── */
    .tog{
      border:1px solid #ffffff18;border-radius:12px;cursor:pointer;
      font-family:'Outfit',sans-serif;font-size:11px;font-weight:500;
      padding:9px 16px;transition:all .25s;letter-spacing:0.5px;
    }
    .tog.on{
      background:linear-gradient(135deg,#ff6b2b22,#ff6b2b11);
      border-color:#ff6b2baa;color:#ff8c4d;
      box-shadow:0 0 16px #ff6b2b33;
    }
    .tog.off{background:#ffffff07;color:#ffffff33}

    /* ── Intensity ── */
    .ibtn{
      border:1px solid #ffffff15;border-radius:10px;cursor:pointer;
      font-family:'Outfit',sans-serif;font-size:9px;font-weight:500;
      padding:7px 4px;flex:1;transition:all .2s;text-align:center;
      background:#ffffff07;letter-spacing:0.5px;
    }

    /* ── Sex buttons ── */
    .sex-btn{
      border:1px solid #ffffff18;border-radius:14px;cursor:pointer;
      font-family:'Bebas Neue',sans-serif;font-size:20px;
      padding:16px;flex:1;transition:all .25s;text-align:center;letter-spacing:2px;
    }
    .sex-btn.active{
      background:linear-gradient(135deg,#ff6b2b22,#ff6b2b0a);
      border-color:#ff6b2bbb;color:#ff8c4d;
      box-shadow:0 0 20px #ff6b2b33, 0 1px 0 #ff8c4d22 inset;
    }
    .sex-btn:not(.active){background:#ffffff07;color:#ffffff2a}

    /* ── Info box ── */
    .ibox{
      background:linear-gradient(135deg,#ff6b2b0c,#ff6b2b05);
      border:1px solid #ff6b2b25;
      border-radius:12px;padding:10px 12px;
    }

    /* ── Labels ── */
    .lbl{font-size:9px;color:#ffffff44;letter-spacing:2px;margin-bottom:7px;text-transform:uppercase;font-weight:600}
    .bb{font-family:'Bebas Neue',sans-serif}

    /* ── Ring ── */
    .rng-bg{fill:none;stroke:#ffffff0a}
    .rng-fg{fill:none;stroke:#ff6b2b;stroke-linecap:round;filter:drop-shadow(0 0 8px #ff6b2b99)}

    /* ── Grids ── */
    .g2{display:grid;grid-template-columns:1fr 1fr;gap:10px}
    .g3{display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px}
    .g4{display:grid;grid-template-columns:1fr 1fr 1fr 1fr;gap:6px}

    /* ── Pills ── */
    .pill{display:inline-block;font-size:8px;padding:2px 8px;border-radius:20px;letter-spacing:1px;font-family:'Outfit',sans-serif;font-weight:600}

    /* ── Bars ── */
    .bar-track{background:#ffffff09;border-radius:4px}
  `;

  // ══════════════════════════════════════════════════════════════════════
  // SETUP SCREEN
  // ══════════════════════════════════════════════════════════════════════
  if (!profile) {
    const sf = setupForm;
    const setSF = (k, v) => setSetupForm(p => ({ ...p, [k]: v }));

    const plannedTDEE = calcPlannedTDEE(sf);
    const previewDiff = sf.startWeight && sf.goalWeight ? (parseFloat(sf.startWeight) - parseFloat(sf.goalWeight)).toFixed(1) : null;
    const previewDays = sf.startDate && sf.endDate ? getTotalDays(sf.startDate, sf.endDate) : null;
    const requiredDeficit = previewDiff && previewDays ? Math.round(parseFloat(previewDiff) * 7700 / previewDays) : null;
    const suggestedKcal = plannedTDEE && requiredDeficit
      ? Math.max(1400, Math.round((plannedTDEE.total - requiredDeficit) / 50) * 50) : null;
    const effectiveKcal = sf.calorieTarget ? parseInt(sf.calorieTarget) : suggestedKcal;
    const actualDeficit = plannedTDEE && effectiveKcal ? plannedTDEE.total - effectiveKcal : null;
    const achievableKg = actualDeficit && previewDays ? (actualDeficit * previewDays / 7700).toFixed(1) : null;

    const canStart = sf.age && sf.height && sf.startWeight && sf.goalWeight && sf.startDate && sf.endDate && sf.sex;

    return (
      <div className="app-root">
        <style>{css}</style>
        <div className="glass-header" style={{ padding:"20px" }}>
          <div style={{ maxWidth:480, margin:"0 auto", display:"flex", justifyContent:"space-between", alignItems:"center" }}>
            <div>
              <div className="bb" style={{ fontSize:28, color:"#ff6b2b", letterSpacing:3 }}>BODY CHALLENGE</div>
              <div style={{ fontSize:10, color:"#ffffff33", letterSpacing:2, marginTop:2 }}>SETUP</div>
            </div>
            <div style={{ display:"flex", gap:8, alignItems:"center" }}>
              {setupForm.startWeight && setupForm.goalWeight ? (
                <button onClick={() => setProfile(setupForm)}
                  style={{ background:"none", border:"1px solid #ffffff22", borderRadius:8, color:"#888", cursor:"pointer", fontFamily:"'Outfit',sans-serif", fontSize:10, padding:"8px 14px" }}>
                  ✕
                </button>
              ) : null}
            </div>
          </div>
          {/* Recovery banner */}
          <div style={{ maxWidth:480, margin:"8px auto 0", padding:"0 20px" }}>
            <div style={{ background:"#ffffff08", border:"1px solid #ffffff15", borderRadius:12, padding:"12px 16px", display:"flex", justifyContent:"space-between", alignItems:"center" }}>
              <div>
                <div style={{ fontSize:11, color:"#ffffff88", marginBottom:2 }}>Bereits registriert?</div>
                {recoveryMsg && <div style={{ fontSize:10, color: recoveryMsg.startsWith("✓") ? "#4caf82" : "#ffb347" }}>{recoveryMsg}</div>}
              </div>
              <button onClick={tryRecoverData} disabled={recovering}
                style={{ background:"#ff6b2b22", border:"1px solid #ff6b2b55", borderRadius:8, color:"#ff6b2b", cursor:"pointer", fontFamily:"'Outfit',sans-serif", fontSize:11, fontWeight:600, padding:"8px 14px", whiteSpace:"nowrap" }}>
                {recovering ? "..." : "🔄 Daten laden"}
              </button>
            </div>
          </div>
        </div>

        <div style={{ maxWidth:480, margin:"0 auto", padding:"16px" }}>
          <div style={{ display:"flex", flexDirection:"column", gap:14 }}>

            {/* ── Persönliche Daten ── */}
            <div className="sc">
              <div className="bb" style={{ fontSize:16, color:"#ff6b2b", letterSpacing:2, marginBottom:14 }}>👤 PERSÖNLICHE DATEN</div>
              <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
                <div>
                  <div className="lbl">NAME (OPTIONAL)</div>
                  <input className="inp" placeholder="z.B. Michael" value={sf.name} onChange={e => setSF("name", e.target.value)}/>
                </div>
                <div>
                  <div className="lbl">GESCHLECHT</div>
                  <div style={{ display:"flex", gap:10 }}>
                    {[["m","♂ MANN"],["f","♀ FRAU"]].map(([v,l]) => (
                      <button key={v} className={`sex-btn ${sf.sex===v?"active":""}`} onClick={() => setSF("sex",v)}>{l}</button>
                    ))}
                  </div>
                </div>
                <div className="g2">
                  <div>
                    <div className="lbl">ALTER</div>
                    <input className="inp" type="number" placeholder="z.B. 35" value={sf.age} onChange={e => setSF("age", e.target.value)}/>
                  </div>
                  <div>
                    <div className="lbl">GRÖSSE (CM)</div>
                    <input className="inp" type="number" placeholder="z.B. 178" value={sf.height} onChange={e => setSF("height", e.target.value)}/>
                  </div>
                </div>
                <div className="g2">
                  <div>
                    <div className="lbl">STARTGEWICHT (KG)</div>
                    <input className="inp" type="number" step="0.1" placeholder="z.B. 92" value={sf.startWeight} onChange={e => setSF("startWeight", e.target.value)}/>
                  </div>
                  <div>
                    <div className="lbl">ZIELGEWICHT (KG)</div>
                    <input className="inp" type="number" step="0.1" placeholder="z.B. 75" value={sf.goalWeight} onChange={e => setSF("goalWeight", e.target.value)}/>
                  </div>
                </div>
                {previewDiff && <div style={{ fontSize:10, color:"#ff6b2b" }}>Zu verlieren: <span className="bb" style={{ fontSize:14 }}>{previewDiff} kg</span></div>}
                <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
                  <div>
                    <div className="lbl">STARTDATUM</div>
                    <input className="inp" type="date" value={sf.startDate} onChange={e => setSF("startDate", e.target.value)}/>
                  </div>
                  <div>
                    <div className="lbl">ENDDATUM</div>
                    <input className="inp" type="date" value={sf.endDate} onChange={e => setSF("endDate", e.target.value)}/>
                  </div>
                </div>
                {previewDays && <div style={{ fontSize:10, color:"#555" }}>Dauer: <span style={{ color:"#f0f0f0" }}>{previewDays} Tage ({Math.round(previewDays/7)} Wochen)</span></div>}
              </div>
            </div>

            {/* ── Aktivitätsplanung ── */}
            <div className="sc">
              <div className="bb" style={{ fontSize:16, color:"#ff6b2b", letterSpacing:2, marginBottom:14 }}>🏃 GEPLANTE AKTIVITÄT</div>
              <div style={{ fontSize:10, color:"#555", marginBottom:14, lineHeight:1.6 }}>
                Diese Angaben berechnen deinen geplanten TDEE. Trag ein was du <span style={{ color:"#f0f0f0" }}>realistisch jede Woche</span> machen wirst.
              </div>
              <div style={{ display:"flex", flexDirection:"column", gap:12 }}>

                {/* Steps */}
                <div>
                  <div className="lbl">SCHRITTE / TAG (NUR ALLTAGSSCHRITTE)</div>
                  <input className="inp" type="number" placeholder="z.B. 8000" value={sf.stepTarget} onChange={e => setSF("stepTarget", e.target.value)}/>
                  <div style={{ fontSize:9, color:"#555", marginTop:4, lineHeight:1.6 }}>
                    Schritte vom Walkingpad werden <span style={{ color:"#ff6b2b" }}>automatisch abgezogen</span> – trag hier nur deine Alltagsschritte ein (ohne Laufband-Sessions).
                  </div>
                  {sf.stepTarget && sf.startWeight && (
                    <div style={{ fontSize:9, color:"#4caf82", marginTop:4 }}>
                      NEAT: ~{calcNEAT(parseInt(sf.stepTarget), parseFloat(sf.startWeight))} kcal/Tag
                    </div>
                  )}
                </div>

                {/* Gym */}
                <div style={{ background:"linear-gradient(135deg,#ff6b2b14,#ff6b2b08)", border:"1px solid #ff6b2b35", borderRadius:8, padding:"12px" }}>
                  <div style={{ fontSize:10, color:"#ff6b2b", letterSpacing:1, marginBottom:10 }}>💪 GYM</div>
                  <div className="g2" style={{ marginBottom:8 }}>
                    <div>
                      <div className="lbl">SESSIONS / WOCHE</div>
                      <select className="sel" value={sf.gymSessionsPerWeek} onChange={e => setSF("gymSessionsPerWeek", e.target.value)}>
                        {[0,1,2,3,4,5,6,7].map(n => <option key={n} value={n}>{n}x</option>)}
                      </select>
                    </div>
                    <div>
                      <div className="lbl">DAUER (MIN)</div>
                      <input className="inp" type="number" placeholder="z.B. 60" value={sf.gymDuration} onChange={e => setSF("gymDuration", e.target.value)}/>
                    </div>
                  </div>
                  <div>
                    <div className="lbl">INTENSITÄT</div>
                    <div style={{ display:"flex", gap:4 }}>
                      {INTENSITY_LEVELS.map((lvl,i) => (
                        <button key={lvl} className="ibtn"
                          style={{ background:sf.gymIntensity===lvl?`${INTENSITY_COLORS[i]}22`:"#ffffff06", borderColor:sf.gymIntensity===lvl?INTENSITY_COLORS[i]:"#ffffff18", color:sf.gymIntensity===lvl?INTENSITY_COLORS[i]:"#444" }}
                          onClick={() => setSF("gymIntensity", lvl)}>{lvl}</button>
                      ))}
                    </div>
                  </div>
                  {sf.gymSessionsPerWeek > 0 && sf.gymDuration && sf.startWeight && (
                    <div style={{ fontSize:9, color:"#ff6b2b", marginTop:8 }}>
                      EAT Gym: ~{calcGymEAT(sf.gymDuration, sf.gymIntensity, sf.startWeight)} kcal/Session · Ø {Math.round(parseFloat(sf.gymSessionsPerWeek)/7*calcGymEAT(sf.gymDuration, sf.gymIntensity, sf.startWeight))} kcal/Tag
                    </div>
                  )}
                </div>

                {/* Walkingpad */}
                <div style={{ background:"linear-gradient(135deg,#ffb34714,#ffb34708)", border:"1px solid #ffb34735", borderRadius:8, padding:"12px" }}>
                  <div style={{ fontSize:10, color:"#ffb347", letterSpacing:1, marginBottom:10 }}>🚶 WALKINGPAD</div>
                  <div className="g2" style={{ marginBottom:8 }}>
                    <div>
                      <div className="lbl">SESSIONS / WOCHE</div>
                      <select className="sel" value={sf.walkSessionsPerWeek} onChange={e => setSF("walkSessionsPerWeek", e.target.value)}>
                        {[0,1,2,3,4,5,6,7].map(n => <option key={n} value={n}>{n}x</option>)}
                      </select>
                    </div>
                    <div>
                      <div className="lbl">DAUER (MIN)</div>
                      <input className="inp" type="number" placeholder="z.B. 25" value={sf.walkDuration} onChange={e => setSF("walkDuration", e.target.value)}/>
                    </div>
                  </div>
                  <div className="g2">
                    <div>
                      <div className="lbl">GESCHWINDIGKEIT (KM/H)</div>
                      <input className="inp" type="number" step="0.5" placeholder="z.B. 5" value={sf.walkSpeed} onChange={e => setSF("walkSpeed", e.target.value)}/>
                    </div>
                    <div>
                      <div className="lbl">STEIGUNG (%)</div>
                      <input className="inp" type="number" placeholder="z.B. 10" value={sf.walkIncline} onChange={e => setSF("walkIncline", e.target.value)}/>
                    </div>
                  </div>
                  {sf.walkSessionsPerWeek > 0 && sf.walkDuration && sf.walkSpeed && sf.startWeight && (
                    <div style={{ fontSize:9, color:"#ffb347", marginTop:8 }}>
                      EAT Walking: ~{calcWalkEAT(sf.walkSpeed, sf.walkIncline, sf.walkDuration, sf.startWeight)} kcal/Session · Ø {Math.round(parseFloat(sf.walkSessionsPerWeek)/7*calcWalkEAT(sf.walkSpeed, sf.walkIncline, sf.walkDuration, sf.startWeight))} kcal/Tag
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* ── Live TDEE Widget ── */}
            {plannedTDEE && (
              <div className="card" style={{ borderColor:"#ffb34744" }}>
                <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:12 }}>
                  <div>
                    <div className="lbl">GEPLANTER TDEE</div>
                    <div className="bb" style={{ fontSize:42, color:"#ffb347", lineHeight:1 }}>{plannedTDEE.total} <span style={{ fontSize:14, color:"#555" }}>kcal</span></div>
                  </div>
                  <div style={{ textAlign:"right" }}>
                    <div className="lbl">BMR</div>
                    <div className="bb" style={{ fontSize:20, color:"#555" }}>{plannedTDEE.bmr}</div>
                  </div>
                </div>
                {[
                  { label:"BMR", val:plannedTDEE.bmr, color:"#444" },
                  { label:"NEAT", val:plannedTDEE.neat, color:"#4caf82" },
                  { label:"Gym (Ø/Tag)", val:plannedTDEE.gym, color:"#ff6b2b" },
                  { label:"Walking (Ø/Tag)", val:plannedTDEE.walk, color:"#ffb347" },
                  { label:"TEF (~10%)", val:plannedTDEE.tef, color:"#888" },
                ].map(({ label, val, color }) => (
                  <div key={label} style={{ display:"flex", alignItems:"center", gap:8, marginBottom:5 }}>
                    <div style={{ width:90, fontSize:9, color:"#555" }}>{label}</div>
                    <div style={{ flex:1, height:3, background:"#ffffff0d", borderRadius:2 }}>
                      <div style={{ height:3, background:color, borderRadius:2, width:`${Math.min(100,(val/plannedTDEE.total)*100)}%`, transition:"width .3s" }}/>
                    </div>
                    <div className="bb" style={{ width:42, textAlign:"right", fontSize:12, color }}>{val}</div>
                  </div>
                ))}
              </div>
            )}

            {/* ── Kalorienziel ── */}
            {plannedTDEE && (
              <div className="sc">
                <div className="bb" style={{ fontSize:16, color:"#ff6b2b", letterSpacing:2, marginBottom:14 }}>🎯 KALORIENZIEL</div>
                <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
                  {suggestedKcal && (
                    <div style={{ background:"#ff6b2b11", border:"1px solid #ff6b2b33", borderRadius:8, padding:"10px 12px" }}>
                      <div className="lbl" style={{ color:"#ff6b2b55", marginBottom:4 }}>VORSCHLAG (AUTOMATISCH)</div>
                      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                        <div>
                          <div className="bb" style={{ fontSize:28, color:"#ff6b2b" }}>{suggestedKcal} <span style={{ fontSize:13, color:"#555" }}>kcal</span></div>
                          <div style={{ fontSize:9, color:"#555", marginTop:2 }}>
                            {plannedTDEE.total} TDEE − {requiredDeficit} Defizit/Tag = {suggestedKcal} kcal
                            {requiredDeficit > plannedTDEE.total - 1400 && <span style={{ color:"#ffb347" }}> (Min. 1.400)</span>}
                          </div>
                        </div>
                        <button onClick={() => setSF("calorieTarget", String(suggestedKcal))}
                          style={{ background:"#ff6b2b", border:"none", borderRadius:6, color:"#000", cursor:"pointer", fontFamily:"'Bebas Neue',sans-serif", fontSize:14, padding:"8px 14px", letterSpacing:1 }}>
                          ÜBERNEHMEN
                        </button>
                      </div>
                    </div>
                  )}
                  <div>
                    <div className="lbl">MANUELL EINGEBEN / ÜBERSCHREIBEN</div>
                    <input className="inp" type="number" placeholder={suggestedKcal ? String(suggestedKcal) : "z.B. 1700"}
                      value={sf.calorieTarget} onChange={e => setSF("calorieTarget", e.target.value)}/>
                  </div>

                  {/* Live deficit feedback */}
                  {effectiveKcal && plannedTDEE && previewDays && (
                    <div style={{ background:"#ffffff0a", border:"1px solid #ffffff18", borderRadius:8, padding:"12px" }}>
                      <div className="g3">
                        <div><div className="lbl">TDEE</div><div className="bb" style={{ fontSize:18, color:"#ffb347" }}>{plannedTDEE.total}</div></div>
                        <div><div className="lbl">ZUFUHR</div><div className="bb" style={{ fontSize:18, color:"#888" }}>{effectiveKcal}</div></div>
                        <div><div className="lbl">DEFIZIT</div><div className="bb" style={{ fontSize:18, color:actualDeficit>0?"#4caf82":"#ff4444" }}>{actualDeficit>0?"+":""}{actualDeficit}</div></div>
                      </div>
                      <div style={{ marginTop:10 }}>
                        {actualDeficit < 0 && <div style={{ fontSize:10, color:"#ff4444" }}>⚠ Kein Defizit – Gewicht wird steigen.</div>}
                        {actualDeficit >= 0 && actualDeficit < 300 && <div style={{ fontSize:10, color:"#ffb347" }}>⚠ Kleines Defizit – erreichbar: ~{achievableKg} kg in {previewDays} Tagen (Ziel: {previewDiff} kg).</div>}
                        {actualDeficit >= 300 && actualDeficit <= 1200 && (
                          <div>
                            <div style={{ fontSize:10, color:"#4caf82" }}>✓ Realistisches Defizit – erreichbar: ~{achievableKg} kg {parseFloat(achievableKg) >= parseFloat(previewDiff) ? "≥ Ziel ✓" : `(Ziel: ${previewDiff} kg)`}</div>
                            <div style={{ height:4, background:"#ffffff0d", borderRadius:2, marginTop:6 }}>
                              <div style={{ height:4, background:"#4caf82", borderRadius:2, width:`${Math.min(100,(parseFloat(achievableKg)/parseFloat(previewDiff))*100)}%`, transition:"width .3s" }}/>
                            </div>
                          </div>
                        )}
                        {actualDeficit > 1200 && <div style={{ fontSize:10, color:"#ff4444" }}>⚠ Sehr aggressiv ({actualDeficit} kcal/Tag) – Muskelverlust möglich. Empfehlung: {suggestedKcal} kcal.</div>}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            <button className="save-btn" style={{ opacity:canStart?1:0.4 }} onClick={saveProfile}>
              CHALLENGE STARTEN 🚀
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ══════════════════════════════════════════════════════════════════════
  // MAIN APP
  // ══════════════════════════════════════════════════════════════════════
  return (
    <div className="app-root">
      <style>{css}</style>

      {/* Header */}
      <div className="glass-header" style={{ padding:"14px 20px" }}>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", maxWidth:480, margin:"0 auto" }}>
          <div>
            <div className="bb" style={{ fontSize:22, color:"#ff6b2b", letterSpacing:3 }}>
              {profile.name ? `${profile.name.toUpperCase()}S CHALLENGE` : "BODY CHALLENGE"}
            </div>
            <div style={{ fontSize:9, color:"#444", letterSpacing:2 }}>{START_DATE} → {END_DATE}</div>
          </div>
          <div style={{ display:"flex", alignItems:"center", gap:12 }}>
            <div style={{ textAlign:"right" }}>
              <div className="bb" style={{ fontSize:28, color:daysLeft<=14?"#ff4444":"#f0f0f0" }}>{daysLeft}</div>
              <div style={{ fontSize:9, color:"#444", letterSpacing:2 }}>TAGE</div>
            </div>
            <button onClick={() => { setSetupForm(profile); setProfile(null); }} style={{ background:"none", border:"1px solid #333", borderRadius:6, color:"#555", cursor:"pointer", fontSize:12, padding:"6px 8px" }} title="Einstellungen">⚙️</button>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ borderBottom:"1px solid #ffffff0a" }}>
        <div className="tab-scroll" style={{ maxWidth:480, margin:"0 auto" }}>
          {["dashboard","defizit","eintragen","charts","verlauf","theorie"].map(t => (
            <button key={t} className={`tab-btn ${tab===t?"active":""}`} onClick={() => setTab(t)}>{t}</button>
          ))}
        </div>
      </div>

      <div style={{ maxWidth:480, margin:"0 auto", padding:16, position:"relative", zIndex:1 }}>

        {/* ══ DASHBOARD ══ */}
        {tab === "dashboard" && (
          <div style={{ display:"flex", flexDirection:"column", gap:14 }}>
            <div className="card" style={{ display:"flex", alignItems:"center", gap:20 }}>
              <svg width={90} height={90} style={{ flexShrink:0 }}>
                <circle className="rng-bg" cx={45} cy={45} r={36} strokeWidth={5}/>
                <circle className="rng-fg" cx={45} cy={45} r={36} strokeWidth={5}
                  strokeDasharray={`${2*Math.PI*36}`}
                  strokeDashoffset={`${2*Math.PI*36*(1-progressPct/100)}`}
                  transform="rotate(-90 45 45)"/>
                <text x={45} y={42} textAnchor="middle" fill="#ff6b2b" fontSize={16} fontFamily="'Bebas Neue'">{progressPct}%</text>
                <text x={45} y={56} textAnchor="middle" fill="#555" fontSize={8} fontFamily="monospace">ZIEL</text>
              </svg>
              <div style={{ flex:1 }}>
                <div className="lbl">AKTUELLES GEWICHT</div>
                <div className="bb" style={{ fontSize:38, color:"#f0f0f0", lineHeight:1 }}>{currentWeight} <span style={{ fontSize:16, color:"#555" }}>KG</span></div>
                <div style={{ display:"flex", gap:16, marginTop:6 }}>
                  <div><div style={{ fontSize:11, color:"#ff6b2b" }}>-{lostSoFar} kg</div><div style={{ fontSize:9, color:"#444" }}>verloren</div></div>
                  <div><div style={{ fontSize:11, color:"#888" }}>{remaining} kg</div><div style={{ fontSize:9, color:"#444" }}>bis {GOAL_WEIGHT} kg</div></div>
                </div>
              </div>
            </div>

            <div className="card" style={{ borderColor:"#2a1800" }}>
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:12 }}>
                <div>
                  <div style={{ display:"flex", alignItems:"center", gap:6, marginBottom:4 }}>
                    <div className="lbl" style={{ marginBottom:0 }}>TDEE</div>
                    <span className="pill" style={{ background:"#ffb34722", color:"#ffb347", border:"1px solid #ffb34744" }}>Ø 7 TAGE</span>
                  </div>
                  <div className="bb" style={{ fontSize:32, color:"#ffb347" }}>{weeklyTDEE} <span style={{ fontSize:13, color:"#555" }}>kcal</span></div>
                </div>
                <div style={{ textAlign:"right" }}>
                  <div style={{ display:"flex", alignItems:"center", gap:6, marginBottom:4, justifyContent:"flex-end" }}>
                    <div className="lbl" style={{ marginBottom:0 }}>TEE HEUTE</div>
                    <span className="pill" style={{ background:"#4caf8222", color:"#4caf82", border:"1px solid #4caf8244" }}>TATSÄCHLICH</span>
                  </div>
                  <div className="bb" style={{ fontSize:32, color:"#4caf82" }}>{todayTEE.total} <span style={{ fontSize:13, color:"#555" }}>kcal</span></div>
                  {todayDeficit !== null && (
                    <div style={{ fontSize:10, color:todayDeficit>0?"#4caf82":"#ff4444", marginTop:2 }}>
                      {todayDeficit>0?"+":""}{todayDeficit} kcal Defizit
                    </div>
                  )}
                </div>
              </div>
              <div style={{ borderTop:"1px solid #1e1e1e", paddingTop:10 }}>
                <div className="lbl">TEE HEUTE</div>
                {[
                  { label:"BMR", val:todayTEE.bmr, color:"#444" },
                  { label:"NEAT", val:todayTEE.neat, color:"#4caf82" },
                  { label:"Gym", val:todayTEE.gym, color:"#ff6b2b" },
                  { label:"Walking", val:todayTEE.walk, color:"#ffb347" },
                  { label:"TEF", val:todayTEE.tef, color:"#888" },
                ].map(({ label, val, color }) => (
                  <div key={label} style={{ display:"flex", alignItems:"center", gap:8, marginBottom:5 }}>
                    <div style={{ width:52, fontSize:9, color:"#555" }}>{label}</div>
                    <div style={{ flex:1, height:3, background:"#ffffff0d", borderRadius:2 }}>
                      <div style={{ height:3, background:color, borderRadius:2, width:`${Math.min(100,(val/todayTEE.total)*100)}%` }}/>
                    </div>
                    <div className="bb" style={{ width:40, textAlign:"right", fontSize:12, color }}>{val}</div>
                  </div>
                ))}
              </div>
            </div>

            <div className="card">
              <div className="lbl">GESAMTDEFIZIT</div>
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                <div>
                  <div className="bb" style={{ fontSize:30, color:totalCumDeficit>0?"#4caf82":"#ff4444" }}>
                    {totalCumDeficit>0?"+":""}{Math.round(totalCumDeficit/1000*10)/10}k <span style={{ fontSize:13, color:"#555" }}>kcal</span>
                  </div>
                  <div style={{ fontSize:10, color:"#555", marginTop:2 }}>≈ {projectedFatKg} kg Fett</div>
                </div>
                <div style={{ textAlign:"right" }}>
                  <div className="lbl">Ø DEFIZIT/TAG</div>
                  <div className="bb" style={{ fontSize:22, color:avgDeficit>=700?"#4caf82":avgDeficit>=400?"#ffb347":"#888" }}>
                    {avgDeficit?`+${avgDeficit}`:"—"} <span style={{ fontSize:11, color:"#555" }}>kcal</span>
                  </div>
                </div>
              </div>
              <div style={{ marginTop:10, height:4, background:"#ffffff0d", borderRadius:2 }}>
                <div style={{ height:4, background:"#4caf82", borderRadius:2, width:`${Math.min(100,(parseFloat(projectedFatKg)/totalDiff)*100)}%`, transition:"width .5s" }}/>
              </div>
              <div style={{ fontSize:9, color:"#444", marginTop:3 }}>{projectedFatKg} / {totalDiff} kg Fett-Ziel</div>
            </div>

            <div className="g2">
              {[["GYM", totalWorkouts],["WALKINGPAD", totalWalking]].map(([label, count]) => (
                <div key={label} className="card">
                  <div className="lbl">{label}</div>
                  <div className="bb" style={{ fontSize:32, color:"#f0f0f0" }}>{count}</div>
                  <div style={{ height:3, background:"#ffffff0d", borderRadius:2, marginTop:8 }}>
                    <div style={{ height:3, background:"#ff6b2b", borderRadius:2, width:`${Math.min(100,(count/Math.max(1,logEntries.length))*100)}%` }}/>
                  </div>
                </div>
              ))}
            </div>

            <div className="card" style={{ borderColor:todayLog?"#ff6b2b44":"#ffffff0d" }}>
              <div className="lbl">HEUTE – {today}</div>
              {todayLog ? (
                <div>
                  <div className="g4" style={{ marginBottom:10 }}>
                    <div><div style={{ fontSize:9, color:"#444" }}>Gewicht</div><div className="bb" style={{ fontSize:14, color:"#ff6b2b" }}>{todayLog.weight||"—"}</div></div>
                    <div><div style={{ fontSize:9, color:"#444" }}>Kcal</div><div className="bb" style={{ fontSize:14, color:parseInt(todayLog.calories)<=CALORIE_TARGET?"#4caf82":"#ff4444" }}>{todayLog.calories||"—"}</div></div>
                    <div><div style={{ fontSize:9, color:"#444" }}>TEE</div><div className="bb" style={{ fontSize:14, color:"#4caf82" }}>{todayTEE.total}</div></div>
                    <div><div style={{ fontSize:9, color:"#444" }}>Defizit</div><div className="bb" style={{ fontSize:14, color:todayDeficit>0?"#4caf82":"#ff4444" }}>{todayDeficit!==null?`+${todayDeficit}`:"—"}</div></div>
                  </div>
                  {todayLog.steps && (
                    <div className="ibox" style={{ marginBottom:6 }}>
                      <div className="g3">
                        <div><div style={{ fontSize:9, color:"#555" }}>GESAMT</div><div className="bb" style={{ fontSize:13, color:"#888" }}>{parseInt(todayLog.steps).toLocaleString()}</div></div>
                        <div><div style={{ fontSize:9, color:"#555" }}>LAUFBAND</div><div className="bb" style={{ fontSize:13, color:"#ff6b2b" }}>−{todayWalkSteps.toLocaleString()}</div></div>
                        <div><div style={{ fontSize:9, color:"#555" }}>ECHT ✓</div><div className="bb" style={{ fontSize:13, color:todayRealSteps>=STEP_TARGET?"#4caf82":"#aaa" }}>{todayRealSteps?.toLocaleString()}</div></div>
                      </div>
                    </div>
                  )}
                  {todayLog.gym?.active && <div className="ibox" style={{ marginBottom:5, fontSize:10 }}>💪 Gym{todayLog.gym.duration?` · ${todayLog.gym.duration} Min`:""}  {todayLog.gym.intensity?` · ${todayLog.gym.intensity}`:""}</div>}
                  {todayLog.sport?.active && (
                    <div style={{ background:"#a78bfa0c", border:"1px solid #a78bfa22", borderRadius:10, padding:"7px 10px", marginBottom:5, fontSize:10 }}>
                      🏅 <span style={{ color:"#a78bfa" }}>{todayLog.sport.type === "✏️ Anderes" ? (todayLog.sport.customName||"Anderes") : todayLog.sport.type}</span>
                      {todayLog.sport.duration ? ` · ${todayLog.sport.duration} Min` : ""}
                    </div>
                  )}
                  {todayLog.walking?.active && <div className="ibox" style={{ fontSize:10 }}>🚶 Walking{todayLog.walking.duration?` · ${todayLog.walking.duration} Min`:""}{todayLog.walking.speed?` · ${todayLog.walking.speed} km/h`:""}{todayLog.walking.incline?` · ${todayLog.walking.incline}%`:""}{todayLog.walking.avgHr?` · Ø ${todayLog.walking.avgHr} bpm`:""}</div>}
                </div>
              ) : (
                <div style={{ color:"#444", fontSize:12 }}>Kein Eintrag → <span style={{ color:"#ff6b2b", cursor:"pointer" }} onClick={() => setTab("eintragen")}>Jetzt eintragen</span></div>
              )}
            </div>
          </div>
        )}

        {/* ══ DEFIZIT ══ */}
        {tab === "defizit" && (
          <div style={{ display:"flex", flexDirection:"column", gap:14 }}>
            <div className="card" style={{ borderColor:"#1a1a2a" }}>
              <div className="lbl">TDEE VS TEE</div>
              <div style={{ fontSize:11, color:"#888", lineHeight:1.8 }}>
                <span style={{ color:"#ffb347" }}>TDEE</span> = Wochendurchschnitt (Planung) · <span style={{ color:"#4caf82" }}>TEE</span> = Tagesgenau (Defizit-Messung)
              </div>
            </div>
            <div className="card">
              <div style={{ display:"flex", alignItems:"center", gap:6, marginBottom:6 }}>
                <div className="lbl" style={{ marginBottom:0 }}>TDEE (WOCHENSCHNITT)</div>
                <span className="pill" style={{ background:"#ffb34722", color:"#ffb347", border:"1px solid #ffb34744" }}>Ø 7 TAGE</span>
              </div>
              <div className="bb" style={{ fontSize:42, color:"#ffb347", lineHeight:1 }}>{weeklyTDEE} <span style={{ fontSize:16, color:"#555" }}>kcal</span></div>
              <div style={{ fontSize:10, color:"#555", marginTop:4 }}>Formel-Basis: {baseTDEE} kcal · Δ {weeklyTDEE-baseTDEE>0?"+":""}{weeklyTDEE-baseTDEE} kcal</div>
            </div>
            <div className="card" style={{ borderColor:"#1a2a1a" }}>
              <div className="lbl">KUMULATIVES DEFIZIT (via TEE)</div>
              <div className="bb" style={{ fontSize:48, color:totalCumDeficit>0?"#4caf82":"#ff4444", lineHeight:1 }}>
                {totalCumDeficit>0?"+":""}{Math.round(totalCumDeficit/1000*10)/10}k<span className="bb" style={{ fontSize:18, color:"#555" }}> kcal</span>
              </div>
              <div style={{ marginTop:12 }}>
                <div style={{ display:"flex", justifyContent:"space-between", fontSize:9, color:"#555", marginBottom:4 }}>
                  <span>0</span><span>Ziel ~{Math.round(totalDiff*7700/1000)}k kcal ({totalDiff} kg)</span>
                </div>
                <div className="bar-track" style={{ height:6, borderRadius:3 }}>
                  <div style={{ height:6, background:"linear-gradient(90deg,#4caf82,#4caf82bb)", borderRadius:3, width:`${Math.min(100,(totalCumDeficit/(totalDiff*7700))*100)}%`, transition:"width .5s" }}/>
                </div>
              </div>
            </div>
            <div className="g2">
              <div className="card">
                <div className="lbl">Ø DEFIZIT/TAG</div>
                <div className="bb" style={{ fontSize:28, color:avgDeficit>=700?"#4caf82":avgDeficit>=400?"#ffb347":"#ff4444" }}>
                  {avgDeficit?`+${avgDeficit}`:"—"}<span style={{ fontSize:11, color:"#555" }}> kcal</span>
                </div>
              </div>
              <div className="card">
                <div className="lbl">FETT ABGEBAUT</div>
                <div className="bb" style={{ fontSize:28, color:"#4caf82" }}>
                  {projectedFatKg}<span style={{ fontSize:11, color:"#555" }}> kg</span>
                </div>
              </div>
            </div>
            <div className="card">
              <div className="lbl" style={{ marginBottom:10 }}>TEE VS ZUFUHR PRO TAG</div>
              {deficitPerDay.length === 0
                ? <div style={{ color:"#444", fontSize:12 }}>Noch keine Daten.</div>
                : (
                  <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
                    {[...deficitPerDay].reverse().slice(0,14).map(d => (
                      <div key={d.date}>
                        <div style={{ display:"flex", justifyContent:"space-between", fontSize:9, color:"#555", marginBottom:3 }}>
                          <span>{d.date.slice(5)}</span>
                          <span><span style={{ color:"#4caf82" }}>TEE {d.tee}</span> · <span style={{ color:"#ff6b2b" }}>{d.calories}</span> · <span style={{ color:d.deficit>=0?"#4caf82":"#ff4444" }}>{d.deficit>=0?"+":""}{d.deficit}</span></span>
                        </div>
                        <div style={{ position:"relative", height:10, borderRadius:3, overflow:"hidden", background:"#ffffff0a" }}>
                          {[
                            { val:d.teeData.bmr, color:"#33333388" },
                            { val:d.teeData.neat, color:"#4caf8266" },
                            { val:d.teeData.gym, color:"#ff6b2b66" },
                            { val:d.teeData.walk, color:"#ffb34766" },
                            { val:d.teeData.tef, color:"#88888844" },
                          ].map(({ val, color }, i) => (
                            <div key={i} style={{ position:"absolute", top:0, bottom:0, background:color,
                              left:`${[d.teeData.bmr,d.teeData.neat,d.teeData.gym,d.teeData.walk].slice(0,i).reduce((a,b)=>a+b,0)/d.tee*100}%`,
                              width:`${(val/d.tee)*100}%` }}/>
                          ))}
                          <div style={{ position:"absolute", top:0, bottom:0, left:0, width:`${Math.min(100,(d.calories/d.tee)*100)}%`, background:"#ff444433", borderRight:"2px solid #ff4444" }}/>
                        </div>
                      </div>
                    ))}
                    <div style={{ display:"flex", gap:10, marginTop:4, fontSize:9, color:"#555", flexWrap:"wrap" }}>
                      <span>■ BMR</span><span style={{ color:"#4caf82" }}>■ NEAT</span><span style={{ color:"#ff6b2b" }}>■ Gym</span><span style={{ color:"#ffb347" }}>■ Walk</span><span style={{ color:"#ff4444" }}>| Zufuhr</span>
                    </div>
                  </div>
                )}
            </div>
            {deficitPerDay.length > 1 && (
              <div className="card">
                <div className="lbl">KUMULATIVES DEFIZIT</div>
                <ResponsiveContainer width="100%" height={160}>
                  <ComposedChart data={deficitPerDay} margin={{ top:5,right:5,bottom:5,left:-20 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#ffffff0a"/>
                    <XAxis dataKey="date" tick={{ fill:"#444",fontSize:9 }} tickFormatter={v=>v.slice(5)} interval="preserveStartEnd"/>
                    <YAxis tick={{ fill:"#444",fontSize:9 }} tickFormatter={v=>`${Math.round(v/1000)}k`}/>
                    <Tooltip contentStyle={{ background:"#ffffff09",border:"1px solid #333",borderRadius:6,fontSize:11 }}/>
                    <Area type="monotone" dataKey="cumDef" fill="#4caf8222" stroke="#4caf82" strokeWidth={2} name="Kumulativ"/>
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>
        )}

        {/* ══ EINTRAGEN ══ */}
        {tab === "eintragen" && (
          <div style={{ display:"flex", flexDirection:"column", gap:14 }}>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", paddingTop:4, marginBottom:10 }}>
              <div>
                <div className="lbl" style={{ marginBottom:4 }}>DATUM</div>
                <input type="date" className="inp" style={{ fontSize:11, padding:"6px 10px" }}
                  value={activeDate}
                  max={today}
                  min={START_DATE}
                  onChange={e => {
                    const d = e.target.value;
                    if (d === today) {
                      setEditDate(null);
                      // Only load if target date has saved data, else keep current form
                      if (logs[today]) setForm({ ...defaultForm, ...logs[today] });
                    } else {
                      setEditDate(d);
                      // If target date has data load it, else keep current form so nothing is lost
                      if (logs[d]) setForm({ ...defaultForm, ...logs[d] });
                    }
                  }}
                />
              </div>
              <div style={{ display:"flex", flexDirection:"column", alignItems:"flex-end", gap:4 }}>
                {editDate && (
                  <button onClick={() => { setEditDate(null); setForm(logs[today] ? { ...defaultForm, ...logs[today] } : defaultForm); }}
                    style={{ background:"none", border:"1px solid #333", borderRadius:6, color:"#ff6b2b", cursor:"pointer", fontFamily:"'JetBrains Mono',monospace", fontSize:9, padding:"5px 10px", letterSpacing:1 }}>
                    ← HEUTE
                  </button>
                )}
                {editDate && logs[editDate] && (
                  <div style={{ fontSize:9, color:"#4caf82" }}>✓ Eintrag vorhanden</div>
                )}
                {editDate && !logs[editDate] && (
                  <div style={{ fontSize:9, color:"#ffb347" }}>⚠ Fehlender Tag</div>
                )}
              </div>
            </div>

            <div className="sc">
              <div className="bb" style={{ fontSize:16, color:"#ff6b2b", letterSpacing:2, marginBottom:12 }}>BASICS</div>
              <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
                <div>
                  <div className="lbl">GEWICHT (KG)</div>
                  <input className="inp" type="number" step="0.1" placeholder={`z.B. ${currentWeight}`} value={form.weight}
                    onChange={e => setForm({...form, weight:e.target.value})}/>
                  {form.weight && <div style={{ fontSize:10, color:"#ffb347", marginTop:4 }}>BMR: <span className="bb" style={{ fontSize:13 }}>{calcBMR(parseFloat(form.weight), parseFloat(profile.height), parseInt(profile.age), profile.sex)} kcal</span></div>}
                </div>
                <div className="g2">
                  <div>
                    <div className="lbl">KALORIEN</div>
                    <input className="inp" type="number" placeholder={`Ziel: ${CALORIE_TARGET}`} value={form.calories}
                      onChange={e => setForm({...form, calories:e.target.value})}/>
                  </div>
                  <div>
                    <div className="lbl">SCHRITTE (TRACKER)</div>
                    <input className="inp" type="number" placeholder={`Ziel: ${STEP_TARGET.toLocaleString()}`} value={form.steps}
                      onChange={e => setForm({...form, steps:e.target.value})}/>
                  </div>
                </div>

                {formTEE && form.calories && (
                  <div style={{ background:"#4caf8210", border:"1px solid #4caf8233", borderRadius:8, padding:12 }}>
                    <div style={{ display:"flex", alignItems:"center", gap:6, marginBottom:10 }}>
                      <div className="lbl" style={{ marginBottom:0 }}>TEE & DEFIZIT</div>
                      <span className="pill" style={{ background:"#4caf8222", color:"#4caf82", border:"1px solid #4caf8244" }}>LIVE</span>
                    </div>
                    {[
                      { label:"BMR", val:formTEE.bmr, color:"#555" },
                      { label:"NEAT", val:formTEE.neat, color:"#4caf82" },
                      { label:"Gym", val:formTEE.gym, color:"#ff6b2b" },
                      { label:"Walking", val:formTEE.walk, color:"#ffb347" },
                      { label:"Sport", val:formTEE.sport||0, color:"#a78bfa" },
                      { label:"TEF", val:formTEE.tef, color:"#888" },
                    ].map(({ label, val, color }) => val > 0 || label === "BMR" ? (
                      <div key={label} style={{ display:"flex", alignItems:"center", gap:6, marginBottom:4 }}>
                        <div style={{ width:52, fontSize:9, color:"#555" }}>{label}</div>
                        <div style={{ flex:1, height:3, background:"#ffffff0d", borderRadius:2 }}>
                          <div style={{ height:3, background:color, borderRadius:2, width:`${Math.min(100,(val/formTEE.total)*100)}%` }}/>
                        </div>
                        <div className="bb" style={{ fontSize:12, color, width:36, textAlign:"right" }}>{val}</div>
                      </div>
                    ) : null)}
                    <div style={{ borderTop:"1px solid #1e1e1e", marginTop:10, paddingTop:10 }}>
                      <div className="g3">
                        <div><div style={{ fontSize:9, color:"#555" }}>TEE</div><div className="bb" style={{ fontSize:20, color:"#4caf82" }}>{formTEE.total}</div></div>
                        <div><div style={{ fontSize:9, color:"#555" }}>ZUFUHR</div><div className="bb" style={{ fontSize:20, color:"#888" }}>{parseInt(form.calories)}</div></div>
                        <div><div style={{ fontSize:9, color:"#555" }}>DEFIZIT</div><div className="bb" style={{ fontSize:20, color:formDeficit>0?"#4caf82":"#ff4444" }}>{formDeficit>0?"+":""}{formDeficit}</div></div>
                      </div>
                    </div>
                  </div>
                )}

                {form.steps && (formWalkSteps > 0 || formSportSteps > 0) && (
                  <div style={{ background:"#ffffff0a", border:"1px solid #ffffff18", borderRadius:8, padding:"10px 12px" }}>
                    <div className="lbl" style={{ marginBottom:8 }}>SCHRITT-KORREKTUR</div>
                    <div style={{ display:"flex", flexDirection:"column", gap:4, marginBottom:8 }}>
                      <div style={{ display:"flex", justifyContent:"space-between", fontSize:10, color:"#888" }}>
                        <span>Tracker gesamt</span>
                        <span className="bb" style={{ fontSize:13 }}>{(parseInt(form.steps)||0).toLocaleString()}</span>
                      </div>
                      {formWalkSteps > 0 && (
                        <div style={{ display:"flex", justifyContent:"space-between", fontSize:10, color:"#ff6b2b88" }}>
                          <span>− Walkingpad</span>
                          <span className="bb" style={{ fontSize:13 }}>−{formWalkSteps.toLocaleString()}</span>
                        </div>
                      )}
                      {formSportSteps > 0 && (
                        <div style={{ display:"flex", justifyContent:"space-between", fontSize:10, color:"#a78bfa88" }}>
                          <span>− Sport ({form.sport?.type})</span>
                          <span className="bb" style={{ fontSize:13 }}>−{formSportSteps.toLocaleString()}</span>
                        </div>
                      )}
                      <div style={{ borderTop:"1px solid #ffffff0a", paddingTop:5, display:"flex", justifyContent:"space-between", fontSize:10 }}>
                        <span style={{ color:"#ffffff88" }}>Echte Schritte ✓</span>
                        <span className="bb" style={{ fontSize:15, color:formRealSteps>=STEP_TARGET?"#4caf82":"#f0f0f0" }}>{formRealSteps.toLocaleString()}</span>
                      </div>
                    </div>
                    <div style={{ height:3, background:"#ffffff09", borderRadius:2 }}>
                      <div style={{ height:3, background:formRealSteps>=STEP_TARGET?"#4caf82":"#ff6b2b", borderRadius:2, width:`${Math.min(100,(formRealSteps/STEP_TARGET)*100)}%`, transition:"width .4s" }}/>
                    </div>
                    <div style={{ fontSize:9, color:"#ffffff33", marginTop:3 }}>
                      {formRealSteps>=STEP_TARGET ? `✓ Ziel erreicht (+${(formRealSteps-STEP_TARGET).toLocaleString()})` : `${(STEP_TARGET-formRealSteps).toLocaleString()} bis Ziel`}
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="sc" style={{ borderColor:form.gym.active?"#ff6b2b44":"#222" }}>
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:form.gym.active?14:0 }}>
                <div className="bb" style={{ fontSize:16, color:form.gym.active?"#ff6b2b":"#444", letterSpacing:2 }}>💪 GYM SESSION</div>
                <button className={`tog ${form.gym.active?"on":"off"}`} onClick={() => setGym("active",!form.gym.active)}>{form.gym.active?"AN ✓":"AUS"}</button>
              </div>
              {form.gym.active && (
                <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
                  <div className="g2">
                    <div>
                      <div className="lbl">DAUER (MIN)</div>
                      <input className="inp" type="number" placeholder="z.B. 70" value={form.gym.duration} onChange={e => setGym("duration",e.target.value)}/>
                    </div>
                    <div>
                      <div className="lbl">INTENSITÄT</div>
                      <div style={{ display:"flex", gap:4 }}>
                        {INTENSITY_LEVELS.map((lvl,i) => (
                          <button key={lvl} className="ibtn"
                            style={{ background:form.gym.intensity===lvl?`${INTENSITY_COLORS[i]}22`:"#ffffff06", borderColor:form.gym.intensity===lvl?INTENSITY_COLORS[i]:"#ffffff18", color:form.gym.intensity===lvl?INTENSITY_COLORS[i]:"#444" }}
                            onClick={() => setGym("intensity",form.gym.intensity===lvl?"":lvl)}>{lvl}</button>
                        ))}
                      </div>
                    </div>
                  </div>
                  {form.gym.duration && form.gym.intensity && form.weight && (
                    <div style={{ fontSize:10, color:"#ff6b2b" }}>EAT Gym: <span className="bb" style={{ fontSize:13 }}>{calcGymEAT(form.gym.duration,form.gym.intensity,form.weight)} kcal</span></div>
                  )}
                  <div>
                    <div className="lbl">NOTIZEN</div>
                    <input className="inp" type="text" placeholder="z.B. Kniebeuge 5x8 @ 80kg..." value={form.gym.exercises} onChange={e => setGym("exercises",e.target.value)}/>
                  </div>
                </div>
              )}
            </div>

            <div className="sc" style={{ borderColor:form.walking.active?"#ff6b2b44":"#222" }}>
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:form.walking.active?14:0 }}>
                <div className="bb" style={{ fontSize:16, color:form.walking.active?"#ff6b2b":"#444", letterSpacing:2 }}>🚶 WALKINGPAD</div>
                <button className={`tog ${form.walking.active?"on":"off"}`} onClick={() => setWalking("active",!form.walking.active)}>{form.walking.active?"AN ✓":"AUS"}</button>
              </div>
              {form.walking.active && (
                <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
                  <div className="g2">
                    <div><div className="lbl">DAUER (MIN)</div><input className="inp" type="number" placeholder="z.B. 25" value={form.walking.duration} onChange={e => setWalking("duration",e.target.value)}/></div>
                    <div><div className="lbl">GESCHWINDIGKEIT (KM/H)</div><input className="inp" type="number" step="0.5" placeholder="z.B. 5.5" value={form.walking.speed} onChange={e => setWalking("speed",e.target.value)}/></div>
                  </div>
                  <div className="g2">
                    <div>
                      <div className="lbl">STEIGUNG (%)</div>
                      <input className="inp" type="number" placeholder="Max: 19" value={form.walking.incline} onChange={e => setWalking("incline",e.target.value)}/>
                      {form.walking.incline && (
                        <div style={{ marginTop:5 }}>
                          <div className="bar-track" style={{ height:4 }}>
                            <div style={{ height:4, background:"#ff6b2b", borderRadius:2, width:`${Math.min(100,(parseFloat(form.walking.incline)/19)*100)}%` }}/>
                          </div>
                          <div style={{ fontSize:9, color:"#555", marginTop:3 }}>{parseFloat(form.walking.incline)>=15?"🔥 Sehr steil!":parseFloat(form.walking.incline)>=10?"💪 Steil":"👍 Moderat"}</div>
                        </div>
                      )}
                    </div>
                    <div>
                      <div className="lbl">Ø PULS (BPM)</div>
                      <input className="inp" type="number" placeholder="z.B. 130" value={form.walking.avgHr} onChange={e => setWalking("avgHr",e.target.value)}/>
                      {form.walking.avgHr && (
                        <div style={{ fontSize:9, marginTop:5, color:parseInt(form.walking.avgHr)>=155?"#ff4444":parseInt(form.walking.avgHr)>=130?"#ff6b2b":"#4caf82" }}>
                          {parseInt(form.walking.avgHr)>=155?"🔥 90%+ HFmax":parseInt(form.walking.avgHr)>=130?"💪 70–85% HFmax":"✓ Leichte Zone"}
                        </div>
                      )}
                    </div>
                  </div>
                  {form.walking.speed && form.walking.duration && (
                    <div style={{ background:"#ffffff0a", border:"1px solid #ffffff18", borderRadius:6, padding:"8px 12px", fontSize:11 }}>
                      <span style={{ color:"#555" }}>Laufband-Schritte: </span>
                      <span className="bb" style={{ fontSize:14, color:"#ff6b2b" }}>{formWalkSteps.toLocaleString()}</span>
                      {form.weight && form.walking.incline && <span style={{ color:"#ffb347", marginLeft:10 }}>· EAT <span className="bb" style={{ fontSize:13 }}>{calcWalkEAT(form.walking.speed,form.walking.incline,form.walking.duration,form.weight)} kcal</span></span>}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* SPORT */}
            <div className="sc" style={{ borderColor:form.sport?.active?"#a78bfa44":"#ffffff15" }}>
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:form.sport?.active?14:0 }}>
                <div className="bb" style={{ fontSize:16, color:form.sport?.active?"#a78bfa":"#ffffff33", letterSpacing:2 }}>🏅 SPORT / AKTIVITÄT</div>
                <button className={`tog ${form.sport?.active?"on":"off"}`}
                  style={ form.sport?.active ? { background:"#a78bfa18", borderColor:"#a78bfaaa", color:"#a78bfa" } : {} }
                  onClick={() => setSport("active", !form.sport?.active)}>
                  {form.sport?.active?"AN ✓":"AUS"}
                </button>
              </div>
              {form.sport?.active && (
                <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
                  <div>
                    <div className="lbl">SPORTART</div>
                    <div style={{ display:"flex", flexWrap:"wrap", gap:6 }}>
                      {SPORT_OPTIONS.map(opt => (
                        <button key={opt.label} onClick={() => { setSport("type", opt.label); setSport("met", opt.met); setSport("spm", opt.spm||0); setSport("customName", ""); }}
                          style={{
                            background: form.sport.type === opt.label ? "#a78bfa22" : "#ffffff07",
                            border: `1px solid ${form.sport.type === opt.label ? "#a78bfaaa" : "#ffffff15"}`,
                            borderRadius:10, color: form.sport.type === opt.label ? "#a78bfa" : "#ffffff55",
                            cursor:"pointer", fontFamily:"'Outfit',sans-serif", fontSize:11, padding:"6px 10px",
                            transition:"all .2s", whiteSpace:"nowrap"
                          }}>
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Custom name if "Anderes" */}
                  {form.sport.type === "✏️ Anderes" && (
                    <div>
                      <div className="lbl">SPORTART EINGEBEN</div>
                      <input className="inp" type="text" placeholder="z.B. Klettern, Tanzen..."
                        value={form.sport.customName||""} onChange={e => setSport("customName", e.target.value)}/>
                    </div>
                  )}

                  <div className="g2">
                    <div>
                      <div className="lbl">DAUER (MIN)</div>
                      <input className="inp" type="number" placeholder="z.B. 60"
                        value={form.sport.duration||""} onChange={e => setSport("duration", e.target.value)}/>
                    </div>
                    {form.sport.type === "✏️ Anderes" && (
                      <div>
                        <div className="lbl">MET-WERT (INTENSITÄT)</div>
                        <input className="inp" type="number" step="0.5" placeholder="z.B. 8.0"
                          value={form.sport.met||""} onChange={e => setSport("met", e.target.value)}/>
                        <div style={{ fontSize:9, color:"#ffffff33", marginTop:3 }}>Netto-MET: Leicht ~2 · Moderat ~5 · Intensiv ~8</div>
                      </div>
                    )}
                  </div>

                  {/* EAT preview */}
                  {form.sport.duration && form.sport.met && form.weight && (
                    <div style={{ background:"#a78bfa10", border:"1px solid #a78bfa25", borderRadius:10, padding:"10px 12px" }}>
                      <div className="lbl" style={{ color:"#a78bfa66", marginBottom:4 }}>GESCHÄTZTE VERBRENNUNG</div>
                      <div className="bb" style={{ fontSize:24, color:"#a78bfa" }}>
                        ~{calcSportEAT(parseFloat(form.sport.met), form.sport.duration, form.weight)} kcal
                      </div>
                      <div style={{ fontSize:9, color:"#ffffff33", marginTop:2 }}>
                        MET {form.sport.met} × {form.weight} kg × {form.sport.duration} Min
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            <button className="save-btn" onClick={saveEntry}>{saved?"✓ GESPEICHERT!":"EINTRAG SPEICHERN"}</button>
          </div>
        )}

        {/* ══ CHARTS ══ */}
        {tab === "charts" && (
          <div style={{ display:"flex", flexDirection:"column", gap:18 }}>
            {[
              { title:"GEWICHT VS ZIELKURVE", height:200,
                el: <LineChart data={chartData} margin={{ top:5,right:5,bottom:5,left:-20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#ffffff0a"/>
                  <XAxis dataKey="label" tick={{ fill:"#444",fontSize:10 }} interval={6}/>
                  <YAxis domain={[GOAL_WEIGHT-2, START_WEIGHT+1]} tick={{ fill:"#444",fontSize:10 }}/>
                  <Tooltip contentStyle={{ background:"#ffffff09",border:"1px solid #333",borderRadius:6,fontSize:12 }}/>
                  <ReferenceLine y={GOAL_WEIGHT} stroke="#ff6b2b33" strokeDasharray="4 4" label={{ value:`${GOAL_WEIGHT}kg`,fill:"#ff6b2b",fontSize:10 }}/>
                  <Line type="monotone" dataKey="goal" stroke="#ff6b2b33" strokeWidth={1} dot={false} strokeDasharray="4 4" name="Zielkurve"/>
                  <Line type="monotone" dataKey="weight" stroke="#ff6b2b" strokeWidth={2.5} dot={{ fill:"#ff6b2b",r:3 }} connectNulls={false} name="Gewicht"/>
                </LineChart>
              },
              { title:"TEE VS ZUFUHR", height:160,
                el: <ComposedChart data={chartData.filter(d=>d.calories)} margin={{ top:5,right:5,bottom:5,left:-20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#ffffff0a"/>
                  <XAxis dataKey="label" tick={{ fill:"#444",fontSize:10 }}/>
                  <YAxis tick={{ fill:"#444",fontSize:10 }}/>
                  <Tooltip contentStyle={{ background:"#ffffff09",border:"1px solid #333",borderRadius:6,fontSize:12 }}/>
                  <ReferenceLine y={CALORIE_TARGET} stroke="#ff6b2b55" strokeDasharray="4 4"/>
                  <Area type="monotone" dataKey="tee" fill="#4caf8222" stroke="#4caf82" strokeWidth={2} name="TEE"/>
                  <Line type="monotone" dataKey="calories" stroke="#ff6b2b" strokeWidth={2} dot={false} name="Zufuhr"/>
                </ComposedChart>
              },
              { title:"DEFIZIT PRO TAG", height:130,
                el: <BarChart data={chartData.filter(d=>d.deficit!==null)} margin={{ top:5,right:5,bottom:5,left:-20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#ffffff0a"/>
                  <XAxis dataKey="label" tick={{ fill:"#444",fontSize:10 }}/>
                  <YAxis tick={{ fill:"#444",fontSize:10 }}/>
                  <Tooltip contentStyle={{ background:"#ffffff09",border:"1px solid #333",borderRadius:6,fontSize:12 }}/>
                  <ReferenceLine y={0} stroke="#ffffff22"/>
                  <Bar dataKey="deficit" fill="#4caf82" radius={[3,3,0,0]} name="Defizit"/>
                </BarChart>
              },
              { title:"ECHTE SCHRITTE", height:130,
                el: <BarChart data={chartData.filter(d=>d.realSteps!==null)} margin={{ top:5,right:5,bottom:5,left:-20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#ffffff0a"/>
                  <XAxis dataKey="label" tick={{ fill:"#444",fontSize:10 }}/>
                  <YAxis tick={{ fill:"#444",fontSize:10 }}/>
                  <Tooltip contentStyle={{ background:"#ffffff09",border:"1px solid #333",borderRadius:6,fontSize:12 }}/>
                  <ReferenceLine y={STEP_TARGET} stroke="#4caf8266" strokeDasharray="4 4"/>
                  <Bar dataKey="realSteps" fill="#4caf82" radius={[3,3,0,0]} name="Schritte"/>
                </BarChart>
              },
            ].map(({ title, height, el }) => (
              <div key={title} className="card">
                <div className="lbl">{title}</div>
                <ResponsiveContainer width="100%" height={height}>{el}</ResponsiveContainer>
              </div>
            ))}
          </div>
        )}

        {/* ══ VERLAUF ══ */}
        {tab === "verlauf" && (
          <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
            {/* Export button */}
            <button onClick={exportReport}
              style={{ background:"#ffffff09", border:"1px solid #ff6b2b44", borderRadius:8, color:"#ff6b2b", cursor:"pointer", fontFamily:"'JetBrains Mono',monospace", fontSize:11, padding:"12px", letterSpacing:2, display:"flex", alignItems:"center", justifyContent:"center", gap:8 }}>
              📊 BERICHT EXPORTIEREN <span style={{ color:"#555", fontSize:9 }}>(HTML + CSV)</span>
            </button>
            {logEntries.length === 0 && <div style={{ color:"#444", textAlign:"center", padding:40, fontSize:12 }}>Noch keine Einträge.</div>}
            {[...logEntries].reverse().map(log => {
              const ws = log.walking?.active ? calcWalkingSteps(log.walking.speed, log.walking.duration) : 0;
              const rs = log.steps ? Math.max(0, parseInt(log.steps)-ws) : null;
              const tee = calcTEE(log, currentWeight, profile);
              const def = log.calories ? tee.total - parseInt(log.calories) : null;
              return (
                <div key={log.date} className="card" style={{ padding:"14px 16px" }}>
                  <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:8 }}>
                    <div style={{ fontSize:10, color:"#555" }}>{log.date}</div>
                    <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                      <div className="bb" style={{ fontSize:18, color:"#f0f0f0" }}>{log.weight?`${log.weight} kg`:""}</div>
                      <button onClick={() => { setEditDate(log.date); setForm({ ...defaultForm, ...log }); setTab("eintragen"); }}
                        style={{ background:"#ffffff0a", border:"1px solid #333", borderRadius:6, color:"#ff6b2b", cursor:"pointer", fontFamily:"'JetBrains Mono',monospace", fontSize:9, padding:"4px 10px" }}>✏️ Edit</button>
                    </div>
                  </div>
                  <div className="g3" style={{ marginBottom:8 }}>
                    <div><div style={{ fontSize:9, color:"#ffffff44" }}>Kcal</div><div className="bb" style={{ fontSize:13, color:log.calories<=CALORIE_TARGET?"#4caf82":"#ff6b6b" }}>{log.calories||"—"}</div></div>
                    <div><div style={{ fontSize:9, color:"#ffffff44" }}>TEE</div><div className="bb" style={{ fontSize:13, color:"#4caf82" }}>{tee.total}</div></div>
                    <div><div style={{ fontSize:9, color:"#ffffff44" }}>Defizit</div><div className="bb" style={{ fontSize:13, color:def>0?"#4caf82":"#ff4444" }}>{def!==null?`+${def}`:"—"}</div></div>
                  </div>
                  {rs !== null && (
                    <div style={{ background:"#ffffff07", border:"1px solid #ffffff12", borderRadius:10, padding:"10px 12px", marginBottom:8 }}>
                      <div style={{ fontSize:9, color:"#ffffff44", letterSpacing:2, textTransform:"uppercase", marginBottom:6 }}>Schritte</div>
                      <div style={{ display:"flex", flexDirection:"column", gap:3 }}>
                        <div style={{ display:"flex", justifyContent:"space-between", fontSize:10, color:"#888" }}>
                          <span>Tracker gesamt</span>
                          <span className="bb" style={{ fontSize:13 }}>{log.steps ? parseInt(log.steps).toLocaleString() : "—"}</span>
                        </div>
                        {ws > 0 && (
                          <div style={{ display:"flex", justifyContent:"space-between", fontSize:10, color:"#ff6b2b88" }}>
                            <span>− Walkingpad</span>
                            <span className="bb" style={{ fontSize:13 }}>−{ws.toLocaleString()}</span>
                          </div>
                        )}
                        {ss > 0 && (
                          <div style={{ display:"flex", justifyContent:"space-between", fontSize:10, color:"#a78bfa88" }}>
                            <span>− Sport ({log.sport?.type === "✏️ Anderes" ? (log.sport?.customName||"Sport") : log.sport?.type})</span>
                            <span className="bb" style={{ fontSize:13 }}>−{ss.toLocaleString()}</span>
                          </div>
                        )}
                        <div style={{ borderTop:"1px solid #ffffff0a", paddingTop:4, display:"flex", justifyContent:"space-between", fontSize:10 }}>
                          <span style={{ color:"#ffffff88" }}>Echte Schritte ✓</span>
                          <span className="bb" style={{ fontSize:15, color:rs>=STEP_TARGET?"#4caf82":"#aaa" }}>{rs.toLocaleString()}</span>
                        </div>
                      </div>
                      <div style={{ marginTop:6, height:3, background:"#ffffff09", borderRadius:2 }}>
                        <div style={{ height:3, background:rs>=STEP_TARGET?"#4caf82":"#ff6b2b", borderRadius:2, width:`${Math.min(100,(rs/STEP_TARGET)*100)}%` }}/>
                      </div>
                    </div>
                  )}
                  <div style={{ display:"flex", gap:8, fontSize:9, color:"#555", marginBottom:6, flexWrap:"wrap" }}>
                    {tee.neat>0 && <span style={{ color:"#4caf82" }}>NEAT +{tee.neat}</span>}
                    {tee.gym>0  && <span style={{ color:"#ff6b2b" }}>Gym +{tee.gym}</span>}
                    {tee.walk>0 && <span style={{ color:"#ffb347" }}>Walk +{tee.walk}</span>}
                    {tee.tef>0  && <span style={{ color:"#888" }}>TEF +{tee.tef}</span>}
                  </div>
                  {log.gym?.active && <div className="ibox" style={{ marginBottom:5, fontSize:10 }}>💪 <span style={{ color:"#ff6b2b" }}>Gym</span>{log.gym.duration?` · ${log.gym.duration} Min`:""}  {log.gym.intensity?` · ${log.gym.intensity}`:""}{log.gym.exercises&&<div style={{ color:"#555",marginTop:2,fontSize:9 }}>{log.gym.exercises}</div>}</div>}
                  {log.sport?.active && (
                    <div style={{ background:"#a78bfa0c", border:"1px solid #a78bfa22", borderRadius:10, padding:"8px 10px", marginBottom:5, fontSize:10 }}>
                      🏅 <span style={{ color:"#a78bfa" }}>{log.sport.type === "✏️ Anderes" ? (log.sport.customName||"Anderes") : log.sport.type}</span>
                      {log.sport.duration ? ` · ${log.sport.duration} Min` : ""}
                      {log.sport.met && log.weight ? ` · ~${calcSportEAT(parseFloat(log.sport.met), log.sport.duration, parseFloat(log.weight))} kcal` : ""}
                    </div>
                  )}
                  {log.walking?.active && <div className="ibox" style={{ fontSize:10 }}>🚶 <span style={{ color:"#ff6b2b" }}>Walking</span>{log.walking.duration?` · ${log.walking.duration} Min`:""}{log.walking.speed?` · ${log.walking.speed} km/h`:""}{log.walking.incline?` · ${log.walking.incline}%`:""}{log.walking.avgHr?` · Ø ${log.walking.avgHr} bpm`:""}{ws>0&&<span style={{ color:"#555" }}> · −{ws.toLocaleString()} Schr.</span>}</div>}
                </div>
              );
            })}
          </div>
        )}

        {/* ══ THEORIE ══ */}
        {tab === "theorie" && (
          <div style={{ display:"flex", flexDirection:"column", gap:14 }}>
            <div className="card" style={{ borderColor:"#1a1a2a" }}>
              <div className="bb" style={{ fontSize:22, color:"#ff6b2b", letterSpacing:2, marginBottom:10 }}>ENERGIEVERBRAUCH VERSTEHEN</div>
              <div style={{ fontSize:11, color:"#888", lineHeight:1.8 }}>Dein täglicher Energieverbrauch setzt sich aus vier Komponenten zusammen. Jede davon lässt sich beeinflussen – manche mehr, manche weniger.</div>
            </div>
            <div className="card">
              <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:10 }}>
                <div style={{ width:4, height:40, background:"#ffb347", borderRadius:2, flexShrink:0 }}/>
                <div><div className="bb" style={{ fontSize:20, color:"#ffb347", letterSpacing:2 }}>TDEE</div><div style={{ fontSize:9, color:"#555", letterSpacing:2 }}>TOTAL DAILY ENERGY EXPENDITURE</div></div>
              </div>
              <div style={{ fontSize:11, color:"#888", lineHeight:1.8, marginBottom:10 }}>Der TDEE ist der <span style={{ color:"#f0f0f0" }}>Wochendurchschnitt</span> deines Verbrauchs, geschätzt via BMR × Aktivitätsfaktor. Gut zur Planung des Kalorienziels.</div>
              <div style={{ background:"#ffb34711", border:"1px solid #ffb34733", borderRadius:6, padding:"10px 12px", fontSize:10, color:"#ffb347" }}>⚠ Durchschnittswert – an Ruhetagen liegt dein Verbrauch darunter, an Trainingstagen darüber.</div>
            </div>
            <div className="card" style={{ borderColor:"#1a1a2a" }}>
              <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:10 }}>
                <div style={{ fontSize:16 }}>🔬</div>
                <div className="bb" style={{ fontSize:14, color:"#ffb347", letterSpacing:2 }}>WISSENSCHAFTLICHE KLARSTELLUNG</div>
              </div>
              <div style={{ fontSize:11, color:"#888", lineHeight:1.8, marginBottom:10 }}>
                Streng wissenschaftlich sind <span style={{ color:"#ffb347" }}>TDEE</span> und <span style={{ color:"#4caf82" }}>TEE</span> <span style={{ color:"#f0f0f0" }}>dasselbe</span>. In der Forschung wird ausschliesslich <span style={{ color:"#4caf82" }}>TEE</span> verwendet (gemessen z.B. mit Doubly Labeled Water). <span style={{ color:"#ffb347" }}>TDEE</span> ist ein Fitness-Community-Begriff für denselben Verbrauch, aber als Schätzwert via Formel.
              </div>
              <div style={{ background:"#ffffff0a", border:"1px solid #ffffff18", borderRadius:6, padding:"10px 12px" }}>
                <div style={{ fontSize:9, color:"#555", marginBottom:8, letterSpacing:1 }}>IN DIESEM TRACKER</div>
                <div style={{ display:"flex", flexDirection:"column", gap:6 }}>
                  <div style={{ display:"flex", gap:10, fontSize:10 }}><span className="bb" style={{ color:"#ffb347", width:52, flexShrink:0 }}>TDEE</span><span style={{ color:"#888" }}>Geschätzter Ø via BMR × 1.55 – gut zum Planen</span></div>
                  <div style={{ display:"flex", gap:10, fontSize:10 }}><span className="bb" style={{ color:"#4caf82", width:52, flexShrink:0 }}>TEE</span><span style={{ color:"#888" }}>Tagesgenau aus BMR + NEAT + EAT + TEF – gut zum Messen</span></div>
                </div>
              </div>
            </div>
            <div className="card">
              <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:10 }}>
                <div style={{ width:4, height:40, background:"#4caf82", borderRadius:2, flexShrink:0 }}/>
                <div><div className="bb" style={{ fontSize:20, color:"#4caf82", letterSpacing:2 }}>TEE</div><div style={{ fontSize:9, color:"#555", letterSpacing:2 }}>TOTAL ENERGY EXPENDITURE</div></div>
              </div>
              <div style={{ fontSize:11, color:"#888", lineHeight:1.8, marginBottom:10 }}>Der <span style={{ color:"#f0f0f0" }}>tatsächliche Verbrauch heute</span> – Summe aus BMR + NEAT + EAT + TEF. Schwankt täglich.</div>
              <div style={{ background:"#4caf8211", border:"1px solid #4caf8233", borderRadius:6, padding:"10px 12px", fontSize:10, color:"#4caf82" }}>✓ Das Defizit wird immer gegen TEE berechnet – ehrlicher und präziser als ein fixer TDEE.</div>
            </div>
            <div className="card">
              <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:10 }}>
                <div style={{ width:4, height:40, background:"#555", borderRadius:2, flexShrink:0 }}/>
                <div><div className="bb" style={{ fontSize:20, color:"#888", letterSpacing:2 }}>BMR</div><div style={{ fontSize:9, color:"#555", letterSpacing:2 }}>BASAL METABOLIC RATE</div></div>
              </div>
              <div style={{ fontSize:11, color:"#888", lineHeight:1.8, marginBottom:10 }}>Energie im <span style={{ color:"#f0f0f0" }}>Ruhezustand</span> für lebenswichtige Funktionen. Sinkt mit dem Gewicht.</div>
              <div style={{ background:"#ffffff0a", border:"1px solid #ffffff18", borderRadius:6, padding:"10px 12px" }}>
                <div style={{ fontSize:9, color:"#555", marginBottom:6, letterSpacing:1 }}>MIFFLIN-ST JEOR</div>
                <div className="bb" style={{ fontSize:13, color:"#f0f0f0" }}>♂ 10×Gewicht + 6.25×Grösse − 5×Alter + 5</div>
                <div className="bb" style={{ fontSize:13, color:"#888", marginTop:4 }}>♀ 10×Gewicht + 6.25×Grösse − 5×Alter − 161</div>
              </div>
            </div>
            <div className="card">
              <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:10 }}>
                <div style={{ width:4, height:40, background:"#4caf82", borderRadius:2, flexShrink:0 }}/>
                <div><div className="bb" style={{ fontSize:20, color:"#4caf82", letterSpacing:2 }}>NEAT</div><div style={{ fontSize:9, color:"#555", letterSpacing:2 }}>NON-EXERCISE ACTIVITY THERMOGENESIS</div></div>
              </div>
              <div style={{ fontSize:11, color:"#888", lineHeight:1.8, marginBottom:10 }}>Kalorien durch <span style={{ color:"#f0f0f0" }}>Alltagsbewegung</span> – Schritte, Stehen, Treppensteigen. Die variabelste Komponente: bis zu 500–1.000 kcal Unterschied zwischen aktiven und inaktiven Menschen.</div>
              <div style={{ background:"#4caf8211", border:"1px solid #4caf8233", borderRadius:6, padding:"10px 12px" }}>
                {[["5.000 Schritte","~200 kcal"],["11.000 Schritte","~440 kcal"],["15.000 Schritte","~600 kcal"]].map(([s,k]) => (
                  <div key={s} style={{ display:"flex", justifyContent:"space-between", fontSize:10, color:"#888", marginBottom:3 }}><span>{s}</span><span style={{ color:"#4caf82" }}>{k}</span></div>
                ))}
              </div>
            </div>
            <div className="card">
              <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:10 }}>
                <div style={{ width:4, height:40, background:"#ff6b2b", borderRadius:2, flexShrink:0 }}/>
                <div><div className="bb" style={{ fontSize:20, color:"#ff6b2b", letterSpacing:2 }}>EAT</div><div style={{ fontSize:9, color:"#555", letterSpacing:2 }}>EXERCISE ACTIVITY THERMOGENESIS</div></div>
              </div>
              <div style={{ fontSize:11, color:"#888", lineHeight:1.8, marginBottom:10 }}>Kalorien durch <span style={{ color:"#f0f0f0" }}>gezieltes Training</span>. Krafttraining hat zudem einen Nachbrenneffekt (EPOC).</div>
              <div style={{ background:"#ff6b2b11", border:"1px solid #ff6b2b33", borderRadius:6, padding:"10px 12px", marginBottom:8 }}>
                {[["Leicht (3 kcal/Min)","~210 kcal"],["Moderat (4.5 kcal/Min)","~315 kcal"],["Intensiv (6 kcal/Min)","~420 kcal"],["Maximal (8 kcal/Min)","~560 kcal"]].map(([lvl,k]) => (
                  <div key={lvl} style={{ display:"flex", justifyContent:"space-between", fontSize:10, color:"#888", marginBottom:3 }}><span>{lvl}</span><span style={{ color:"#ff6b2b" }}>{k}</span></div>
                ))}
                <div style={{ fontSize:9, color:"#555", marginTop:4 }}>Beispiel: 70 Min. Krafttraining</div>
              </div>
              <div style={{ background:"#ffffff0a", border:"1px solid #ffffff18", borderRadius:6, padding:"10px 12px" }}>
                <div style={{ fontSize:9, color:"#555", marginBottom:4 }}>EPOC – NACHBRENNEFFEKT</div>
                <div style={{ fontSize:10, color:"#888", lineHeight:1.6 }}>Nach intensivem Training verbrennt der Körper noch <span style={{ color:"#f0f0f0" }}>50–200 kcal extra</span> in den folgenden Stunden. Im Tracker nicht eingerechnet – das ist dein versteckter Bonus. 🔥</div>
              </div>
            </div>
            {/* MET card */}
            <div className="card">
              <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:10 }}>
                <div style={{ width:4, height:40, background:"#a78bfa", borderRadius:2, flexShrink:0 }}/>
                <div><div className="bb" style={{ fontSize:20, color:"#a78bfa", letterSpacing:2 }}>MET</div><div style={{ fontSize:9, color:"#ffffff44", letterSpacing:2 }}>METABOLIC EQUIVALENT OF TASK</div></div>
              </div>
              <div style={{ fontSize:11, color:"#888", lineHeight:1.8, marginBottom:10 }}>
                MET ist eine Einheit die die <span style={{ color:"#f0f0f0" }}>Intensität einer körperlichen Aktivität</span> im Vergleich zur Ruhe beschreibt. 1 MET = Ruhezustand (sitzen, schlafen). Eine Aktivität mit MET 6 verbraucht 6× mehr Energie als im Ruhezustand.
              </div>
              <div style={{ background:"#a78bfa10", border:"1px solid #a78bfa25", borderRadius:10, padding:"12px", marginBottom:10 }}>
                <div style={{ fontSize:9, color:"#a78bfa88", letterSpacing:2, marginBottom:8 }}>NETTO-FORMEL (DIESER TRACKER)</div>
                <div className="bb" style={{ fontSize:14, color:"#f0f0f0" }}>EAT = (MET − 1) × Gewicht × Dauer</div>
                <div style={{ fontSize:10, color:"#888", marginTop:6 }}>
                  Das <span style={{ color:"#f0f0f0" }}>−1</span> subtrahiert den Ruheanteil – denn der BMR läuft im Hintergrund bereits und ist im TEE enthalten. So wird Doppelzählung vermieden.
                </div>
                <div style={{ fontSize:10, color:"#888", marginTop:4 }}>
                  Beispiel: 55 Min. Fussball · MET 7.0 · 92 kg<br/>
                  <span style={{ color:"#a78bfa" }}>(7.0 − 1) × 92 × 0.92 ≈ 508 kcal</span>
                </div>
              </div>
              <div style={{ background:"#ffffff07", border:"1px solid #ffffff12", borderRadius:10, padding:"12px" }}>
                <div style={{ fontSize:9, color:"#ffffff44", letterSpacing:2, marginBottom:8 }}>MET-REFERENZWERTE (FREIZEIT)</div>
                <div style={{ display:"flex", flexDirection:"column", gap:5 }}>
                  {[
                    ["🧘 Yoga / Dehnen",       "2.5",  "#888"],
                    ["💃 Tanzen / Volleyball",  "4–5",  "#888"],
                    ["🚴 Velofahren (locker)",  "6.0",  "#ffb347"],
                    ["🏊 Schwimmen",            "6.0",  "#ffb347"],
                    ["⚽ Fussball",             "7.0",  "#ffb347"],
                    ["🏃 Joggen",               "7.5",  "#ff6b2b"],
                    ["🏋️ Crossfit",             "8.0",  "#ff6b2b"],
                    ["🥊 Boxen",                "9.0",  "#ff4444"],
                  ].map(([sport, met, color]) => (
                    <div key={sport} style={{ display:"flex", alignItems:"center", gap:8 }}>
                      <div style={{ flex:1, fontSize:10, color:"#888" }}>{sport}</div>
                      <div style={{ width:60, height:3, background:"#ffffff09", borderRadius:2 }}>
                        <div style={{ height:3, background:color, borderRadius:2, width:`${(parseFloat(met)-1)/9*100}%` }}/>
                      </div>
                      <div className="bb" style={{ fontSize:13, color, width:30, textAlign:"right" }}>{met}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="card">
              <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:10 }}>
                <div style={{ width:4, height:40, background:"#888", borderRadius:2, flexShrink:0 }}/>
                <div><div className="bb" style={{ fontSize:20, color:"#888", letterSpacing:2 }}>TEF</div><div style={{ fontSize:9, color:"#555", letterSpacing:2 }}>THERMIC EFFECT OF FOOD</div></div>
              </div>
              <div style={{ fontSize:11, color:"#888", lineHeight:1.8, marginBottom:10 }}>Energie zum <span style={{ color:"#f0f0f0" }}>Verdauen</span> der Nahrung. Protein hat den höchsten TEF.</div>
              <div style={{ background:"#ffffff0a", border:"1px solid #ffffff18", borderRadius:6, padding:"10px 12px" }}>
                {[["Protein","20–30%"],["Kohlenhydrate","5–10%"],["Fette","0–3%"],["Durchschnitt","~10%"]].map(([m,p]) => (
                  <div key={m} style={{ display:"flex", justifyContent:"space-between", fontSize:10, color:"#888", marginBottom:3 }}><span>{m}</span><span style={{ color:m==="Durchschnitt"?"#f0f0f0":"#555" }}>{p}</span></div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
