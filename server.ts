import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import KJUR from "jsrsasign";
import path from "path";
import { fileURLToPath } from "url";

dotenv.config({ quiet: true });

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const distDir = path.join(__dirname, "dist");

const sdkKey = process.env.ZOOM_SDK_KEY;
const sdkSecret = process.env.ZOOM_SDK_SECRET;
// Render (and most hosts) inject PORT; fall back to a default.
const port = process.env.PORT ? Number(process.env.PORT) : 3000;
// The public URL the frontend should call for the API. Render sets this automatically;
// ENDPOINT_URL lets you override it (e.g. for local split frontend/backend dev).
const endpointUrl = process.env.RENDER_EXTERNAL_URL || process.env.ENDPOINT_URL || null;

const app = express();
app.use(cors());
app.use(express.static(distDir));
// models/ lives outside dist, so serve it explicitly for the browser/worker fetches.
app.use("/models", express.static(path.join(__dirname, "models")));

// Same signing logic as generateToken.ts, exposed over HTTP instead of the CLI.
function generateSignature(
	sessionName: string,
	role: number,
	expiresInHours: number = 2,
): string {
	const iat = Math.round(new Date().getTime() / 1000) - 30;
	const exp = iat + 60 * 60 * expiresInHours;
	const oHeader = { alg: "HS256", typ: "JWT" };
	const oPayload = {
		app_key: sdkKey,
		tpc: sessionName,
		role_type: role,
		version: 1,
		iat: iat,
		exp: exp,
	};
	const sHeader = JSON.stringify(oHeader);
	const sPayload = JSON.stringify(oPayload);
	return KJUR.KJUR.jws.JWS.sign("HS256", sHeader, sPayload, sdkSecret!);
}

app.get("/zoomtoken", (req, res) => {
	if (!sdkKey || !sdkSecret) {
		res.status(500).json({
			error: "ZOOM_SDK_KEY and ZOOM_SDK_SECRET must be set in your environment or .env file",
		});
		return;
	}

	const sessionName =
		typeof req.query.session === "string" && req.query.session.trim() !== ""
			? req.query.session
			: "TestSession";
	const role = req.query.role ? parseInt(req.query.role as string, 10) : 1;
	const expiresInHours = req.query.expires
		? parseFloat(req.query.expires as string)
		: 2;

	if (!Number.isInteger(role) || role < 0) {
		res.status(400).json({ error: `Invalid role: ${req.query.role}` });
		return;
	}

	if (isNaN(expiresInHours) || expiresInHours <= 0) {
		res.status(400).json({ error: `Invalid expires: ${req.query.expires}` });
		return;
	}

	const token = generateSignature(sessionName, role, expiresInHours);
	res.json({ token });
});

// Lets the browser read server-side .env values at runtime instead of relying on Vite's import.meta.env.
app.get("/config", (_req, res) => {
	res.json({ endpointUrl });
});

// SPA fallback so client-side routes (and the root path) resolve to the built app.
app.get(/^(?!\/zoomtoken|\/config).*/, (_req, res) => {
	res.sendFile(path.join(distDir, "index.html"));
});

app.listen(port, () => {
	console.log(`Zoom token server listening on port ${port}`);
});
