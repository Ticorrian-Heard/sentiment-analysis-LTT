import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import KJUR from "jsrsasign";

dotenv.config({ quiet: true });

const sdkKey = process.env.ZOOM_SDK_KEY;
const sdkSecret = process.env.ZOOM_SDK_SECRET;
const port = process.env.VITE_SERVER_PORT ? Number(process.env.VITE_SERVER_PORT) : 3000;

const app = express();
app.use(cors());

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

app.listen(port, () => {
	console.log(`Zoom token server listening on port ${port}`);
});
