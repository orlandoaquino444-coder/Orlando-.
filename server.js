const express = require("express");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const { OAuth2Client } = require("google-auth-library");
const path = require("path");

const app = express();
app.use(helmet({ contentSecurityPolicy: false }));
app.use(express.json({ limit: "1mb" }));
app.use(express.static(path.join(__dirname, "..", "public")));

const firebaseProjectId = "profefacil-9318a";
const firebaseVerifier = new OAuth2Client();
const firebaseReady = true; // Verifica ID tokens con certificados públicos de Google; no requiere cuenta de servicio.

async function authenticate(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!token) return res.status(401).json({ error: "Inicia sesión para continuar." });
  try {
    const ticket = await firebaseVerifier.verifyIdToken(token, firebaseProjectId);
    req.user = ticket.getPayload();
    if (!req.user || req.user.aud !== firebaseProjectId) {
      return res.status(401).json({ error: "Token de Firebase no válido para este proyecto." });
    }
    next();
  } catch (e) {
    console.error("Firebase token verification:", e.message);
    res.status(401).json({ error: "Sesión no válida. Vuelve a iniciar sesión." });
  }
}

const limiter = rateLimit({ windowMs: 60 * 1000, limit: 20, standardHeaders: true, legacyHeaders: false });
app.use("/api/", limiter);

async function authenticate(req, res, next) {
  if (!firebaseReady) {
    return res.status(503).json({ error: "El servidor no está configurado: falta FIREBASE_SERVICE_ACCOUNT_JSON en Render." });
  }
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!token) return res.status(401).json({ error: "Inicia sesión para continuar." });
  try {
    req.user = await admin.auth().verifyIdToken(token);
    next();
  } catch {
    res.status(401).json({ error: "Sesión no válida. Vuelve a iniciar sesión." });
  }
}

function extractJson(text) {
  const cleaned = String(text || "").replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("Gemini no devolvió un objeto JSON válido.");
  return JSON.parse(cleaned.slice(start, end + 1));
}

app.get("/api/health", (_req, res) => {
  res.json({
    status: "ok",
    firebaseTokenVerification: firebaseReady,
    geminiConfigured: Boolean(process.env.GEMINI_API_KEY),
    model: process.env.GEMINI_MODEL || "gemini-2.5-flash"
  });
});

app.post("/api/chat", authenticate, async (req, res) => {
  try {
    if (!process.env.GEMINI_API_KEY) {
      return res.status(503).json({ error: "Falta GEMINI_API_KEY en las variables de Render." });
    }
    const { schoolName, message, history = [], records = [], gradingScale = 10 } = req.body || {};
    if (typeof schoolName !== "string" || typeof message !== "string" || !message.trim()) {
      return res.status(400).json({ error: "Faltan el colegio o el mensaje." });
    }
    if (message.length > 8000) return res.status(400).json({ error: "El mensaje es demasiado largo." });

    // Solo se acepta el contexto que el cliente obtuvo de la ruta del colegio seleccionado.
    const safeRecords = Array.isArray(records) ? records.slice(-250) : [];
    const safeHistory = Array.isArray(history) ? history.slice(-12) : [];

    const system = `Eres ORLANDO, un asistente académico para docentes. Trabajas exclusivamente para el colegio "${schoolName}".
REGLAS OBLIGATORIAS:
- Usa solamente los registros que aparecen en el contexto de este colegio. No afirmes que conoces datos que no están registrados.
- Nunca inventes estudiantes, fechas, tareas, faltas, notas ni sanciones. Si falta información, dilo y pide registrarla.
- Distingue entre hechos registrados, cálculos y recomendaciones.
- Para explicar una nota, enumera los registros concretos que la justifican. No atribuyas una nota a una falta o conducta si eso no está registrado.
- No conviertas automáticamente puntos en una nota final si no se conoce el sistema de ponderación. La escala configurada actualmente es de 1 a ${gradingScale}, pero puede requerirse conocer pesos o criterios.
- Si el usuario comunica hechos escolares, conviértelos en registros estructurados. No registres como hecho algo que solo sea una pregunta o hipótesis.
- Responde en español claro y útil para docentes. Protege la privacidad de los estudiantes.
Devuelve ÚNICAMENTE JSON válido con esta estructura:
{"reply":"respuesta para el profesor","records":[{"type":"attendance|task|grade|conduct|note","student":"nombre","date":"YYYY-MM-DD o null","subject":"materia o null","description":"detalle factual","status":"present|absent|late|justified|submitted|missing o null","points":numero o null,"maxPoints":numero o null,"score":numero o null,"scale":numero o null}]}
Si no hay un nuevo hecho que registrar, devuelve records como []. No uses Markdown fuera del JSON.`;

    const prompt = {
      school: schoolName,
      gradingScale,
      existingRecords: safeRecords,
      recentConversation: safeHistory,
      teacherMessage: message
    };

    const model = process.env.GEMINI_MODEL || "gemini-2.5-flash";
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(process.env.GEMINI_API_KEY)}`;
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: system }] },
        contents: [{ role: "user", parts: [{ text: JSON.stringify(prompt) }] }],
        generationConfig: { responseMimeType: "application/json", temperature: 0.2 }
      })
    });
    const data = await response.json();
    if (!response.ok) {
      console.error("Gemini API:", data);
      return res.status(502).json({ error: data?.error?.message || "Gemini no pudo procesar la solicitud. Revisa la clave y el modelo." });
    }
    const output = data?.candidates?.[0]?.content?.parts?.map(p => p.text || "").join("") || "";
    const parsed = extractJson(output);
    const allowed = new Set(["attendance", "task", "grade", "conduct", "note"]);
    const cleanedRecords = (Array.isArray(parsed.records) ? parsed.records : []).slice(0, 30)
      .filter(r => r && allowed.has(r.type) && typeof r.student === "string" && r.student.trim())
      .map(r => ({
        type: r.type,
        student: String(r.student).slice(0, 100),
        date: typeof r.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(r.date) ? r.date : null,
        subject: typeof r.subject === "string" ? r.subject.slice(0, 100) : null,
        description: typeof r.description === "string" ? r.description.slice(0, 1000) : "",
        status: typeof r.status === "string" ? r.status.slice(0, 30) : null,
        points: Number.isFinite(Number(r.points)) ? Number(r.points) : null,
        maxPoints: Number.isFinite(Number(r.maxPoints)) ? Number(r.maxPoints) : null,
        score: Number.isFinite(Number(r.score)) ? Number(r.score) : null,
        scale: Number.isFinite(Number(r.scale)) ? Number(r.scale) : null,
        createdAt: new Date().toISOString()
      }));
    res.json({ reply: String(parsed.reply || "No pude generar una respuesta."), records: cleanedRecords });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message || "Error interno." });
  }
});

app.get("*", (_req, res) => res.sendFile(path.join(__dirname, "..", "public", "index.html")));
const port = process.env.PORT || 10000;
app.listen(port, () => console.log(`Orlando AI escuchando en ${port}`));
