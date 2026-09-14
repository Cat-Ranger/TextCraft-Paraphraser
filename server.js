require("dotenv").config();
const express = require("express");
const cors = require("cors");
const rateLimit = require("express-rate-limit");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());

// Limit incoming JSON body payload size to 100kb (prevents huge payload attacks)
app.use(express.json({ limit: "100kb" }));

// Configure rate limiter (10 requests per minute per IP)
const apiLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute window
  max: 10, // Limit each IP to 10 requests per windowMs
  standardHeaders: true, // Return rate limit info in RateLimit-* headers
  legacyHeaders: false, // Disable X-RateLimit-* headers
  message: {
    error:
      "Too many requests from this IP. Please wait a minute before trying again.",
  },
});

// Apply rate limiter specifically to the text processing route
app.post("/api/process-text", apiLimiter, async (req, res) => {
  try {
    const { prompt } = req.body;

    // 1. Check if prompt exists and is a string
    if (!prompt || typeof prompt !== "string") {
      return res.status(400).json({
        error: "Invalid request. Prompt must be a valid text string.",
      });
    }

    const trimmedPrompt = prompt.trim();

    // 2. Check for empty string after trimming
    if (trimmedPrompt.length === 0) {
      return res.status(400).json({ error: "Prompt cannot be empty." });
    }

    // 3. Enforce 5,000 character limit (matches your frontend UI limit)
    if (trimmedPrompt.length > 5000) {
      return res.status(400).json({
        error:
          "Prompt exceeds the maximum character limit of 5,000 characters.",
      });
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      console.error("ERROR: GEMINI_API_KEY is missing from your .env file!");
      return res
        .status(500)
        .json({ error: "Server configuration error: Missing API Key." });
    }

    const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent?key=${apiKey}`;

    const response = await fetch(apiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: trimmedPrompt }] }],
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      console.error("Gemini API Error:", data);
      return res.status(response.status).json(data);
    }

    res.json(data);
  } catch (error) {
    console.error("Server Error:", error);
    res
      .status(500)
      .json({ error: `Failed to communicate with API: ${error.message}` });
  }
});

app.listen(PORT, () => {
  console.log(`Server is running at http://127.0.0.1:${PORT}`);
});
