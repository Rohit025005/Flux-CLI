// src/index.js — first line must be this
import "dotenv/config";

import express from "express";
import cors from "cors";
import { toNodeHandler } from "better-auth/node";

import { auth } from "./lib/auth.js";
import prisma from "./lib/db.js";

const app = express();
const PORT = process.env.PORT || 3005;

// FIXED: Middleware order - JSON parser must come BEFORE routes
app.use(express.json());

app.use(
  cors({
    origin: "http://localhost:3000",
    credentials: true,
  })
);

app.use("/device",(req,res)=>{
  const { user_code } = req.query;
  res.redirect(`http://localhost:3000/device?user_code=${user_code}`);
});
// Use `app.use` for express v5 route mounting
app.use("/api/auth", toNodeHandler(auth));

app.get("/hello", (req, res) => res.send("OK"));

const test = await prisma.$queryRaw`SELECT 1`;
console.log("DB OK:", test);

app.listen(PORT, () => {
  console.log(`server on http://localhost:${PORT}`);
});