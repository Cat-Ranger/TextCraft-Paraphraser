require("dotenv").config();
const express = require("express");
const cors = require("cors");
const rateLimit = require("express-rate-limit");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());

// Limit incoming JSON body payload size to 100kb
app.use(express.json({ limit: "100kb" }));

// Configure rate limiter (10 requests per minute per IP)
const apiLimiter = rateLimit({
  windowMs: 1 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error:
      "Too many requests from this IP. Please wait a minute before trying again.",
  },
});

// Apply rate limiter specifically to the text processing route
app.post("/api/process-text", apiLimiter, async (req, res) => {
  try {
    const { prompt } = req.body;

    // Check if prompt exists and is a string
    if (!prompt || typeof prompt !== "string") {
      return res.status(400).json({
        error: "Invalid request. Prompt must be a valid text string.",
      });
    }

    const trimmedPrompt = prompt.trim();

    // Check for empty string after trimming
    if (trimmedPrompt.length === 0) {
      return res.status(400).json({
        error: "Prompt cannot be empty.",
      });
    }

    // Enforce 5,000 character limit
    if (trimmedPrompt.length > 5000) {
      return res.status(400).json({
        error:
          "Prompt exceeds the maximum character limit of 5,000 characters.",
      });
    }

    // Get Gemini API key from environment variables
    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey) {
      console.error("ERROR: GEMINI_API_KEY is missing from your .env file!");

      return res.status(500).json({
        error: "Server configuration error. Missing API Key.",
      });
    }

    // Gemini API request
    const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent?key=${apiKey}`;

    const response = await fetch(apiUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              {
                text: trimmedPrompt,
              },
            ],
          },
        ],
      }),
    });

    const data = await response.json();

    // Handle Gemini API errors
    if (!response.ok) {
      console.error("Gemini API Error:", response.status, data);

      // Gemini quota/rate limit exceeded
      if (response.status === 429) {
        return res.status(429).json({
          error: "The AI usage limit has been reached. Please try again later.",
          retryAfter: 60,
        });
      }

      // Other Gemini API errors
      return res.status(502).json({
        error:
          "The AI service is currently unavailable. Please try again later.",
      });
    }

    // Successful response
    res.json(data);
  } catch (error) {
    // Log detailed error on the server
    console.error("Server Error:", error);

    // Return a safe error message to the client
    res.status(500).json({
      error: "An internal server error occurred.",
    });
  }
});

app.listen(PORT, () => {
  console.log(`Server is running at http://127.0.0.1:${PORT}`);
});
