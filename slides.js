const fs = require("fs");
const axios = require("axios");
const { google } = require("googleapis");
require("dotenv").config();

// Load credentials
const credentials = JSON.parse(fs.readFileSync("credentials.json"));

// Authenticate Google API
const auth = new google.auth.GoogleAuth({
  credentials,
  scopes: [
    "https://www.googleapis.com/auth/presentations",
    "https://www.googleapis.com/auth/drive",
  ],
});

// Load API keys from .env
const GOOGLE_SEARCH_API_KEY = process.env.GOOGLE_SEARCH_API_KEY;
const GOOGLE_CX = process.env.GOOGLE_CX;
const USER_EMAIL = process.env.USER_EMAIL;

// Function to fetch text from Google Search API
async function fetchTextFromGoogle(topic) {
  try {
    const url = `https://www.googleapis.com/customsearch/v1?q=${encodeURIComponent(
      topic
    )}&cx=${GOOGLE_CX}&key=${GOOGLE_SEARCH_API_KEY}`;
    const response = await axios.get(url);

    if (!response.data.items) {
      throw new Error("No search results found.");
    }

    return response.data.items
      .map((item) => item.snippet)
      .slice(0, 3)
      .join("\n\n") || "No relevant information found.";
  } catch (error) {
    console.error("❌ Failed to fetch text:", error.response?.data?.error?.message || error.message);
    return "No relevant information found.";
  }
}

// Function to fetch image from Google Search API
async function fetchImageFromGoogle(topic) {
  try {
    const url = `https://www.googleapis.com/customsearch/v1?q=${encodeURIComponent(
      topic
    )}&cx=${GOOGLE_CX}&key=${GOOGLE_SEARCH_API_KEY}&searchType=image`;
    const response = await axios.get(url);

    if (!response.data.items || response.data.items.length === 0) {
      throw new Error("No images found.");
    }

    return response.data.items[0]?.link || null;
  } catch (error) {
    console.error("❌ Failed to fetch image:", error.response?.data?.error?.message || error.message);
    return null;
  }
}

// Function to create a Google Slides presentation
async function createPresentation(topic) {
  const slides = google.slides({ version: "v1", auth });
  const drive = google.drive({ version: "v3", auth });

  try {
    // Step 1: Create a new Google Slides presentation
    const res = await slides.presentations.create({
      requestBody: { title: `Presentation on ${topic}` },
    });

    const presentationId = res.data.presentationId;
    console.log(
      `✅ Created Presentation: https://docs.google.com/presentation/d/${presentationId}`
    );

    // Step 2: Fetch content from Google
    const textContent = await fetchTextFromGoogle(topic);
    const imageUrl = await fetchImageFromGoogle(topic);

    // Step 3: Retrieve slide ID
    const presentation = await slides.presentations.get({ presentationId });

    // Slide IDs for structured format
    const slideIds = [];

    // Create title slide
    const titleSlideId = "SLIDE_TITLE";
    slideIds.push(titleSlideId);

    const titleTextId = "TITLE_TEXT_BOX"; // Unique text box for title slide

    let requests = [
      {
        createSlide: {
          objectId: titleSlideId,
          slideLayoutReference: { predefinedLayout: "TITLE" },
        },
      },
      {
        createShape: {
          objectId: titleTextId,
          shapeType: "TEXT_BOX",
          elementProperties: {
            pageObjectId: titleSlideId,
            size: {
              height: { magnitude: 100, unit: "PT" },
              width: { magnitude: 500, unit: "PT" },
            },
            transform: {
              scaleX: 1,
              scaleY: 1,
              translateX: 100,
              translateY: 100,
              unit: "PT",
            },
          },
        },
      },
      {
        insertText: {
          objectId: titleTextId,
          text: `Introduction to ${topic}`,
        },
      },
    ];

    // Create content slide
    const contentSlideId = "SLIDE_CONTENT";
    slideIds.push(contentSlideId);

    const textBoxId = "TEXT_BOX_1";
    requests.push(
      {
        createSlide: {
          objectId: contentSlideId,
          slideLayoutReference: { predefinedLayout: "TITLE_AND_BODY" },
        },
      },
      {
        createShape: {
          objectId: textBoxId,
          shapeType: "TEXT_BOX",
          elementProperties: {
            pageObjectId: contentSlideId,
            size: {
              height: { magnitude: 300, unit: "PT" },
              width: { magnitude: 500, unit: "PT" },
            },
            transform: {
              scaleX: 1,
              scaleY: 1,
              translateX: 50,
              translateY: 50,
              unit: "PT",
            },
          },
        },
      },
      {
        insertText: {
          objectId: textBoxId,
          text: textContent,
        },
      }
    );

    // Create image slide (if image exists)
    if (imageUrl) {
      const imageSlideId = "SLIDE_IMAGE";
      slideIds.push(imageSlideId);

      requests.push(
        {
          createSlide: {
            objectId: imageSlideId,
            slideLayoutReference: { predefinedLayout: "BLANK" },
          },
        },
        {
          createImage: {
            url: imageUrl,
            elementProperties: {
              pageObjectId: imageSlideId,
              size: {
                height: { magnitude: 300, unit: "PT" },
                width: { magnitude: 400, unit: "PT" },
              },
              transform: {
                scaleX: 1,
                scaleY: 1,
                translateX: 100,
                translateY: 100,
                unit: "PT",
              },
            },
          },
        }
      );
    }

    // Apply updates
    await slides.presentations.batchUpdate({
      presentationId,
      requestBody: { requests },
    });

    console.log("✅ Successfully added structured content to slides.");

    // Share the presentation
    await drive.permissions.create({
      fileId: presentationId,
      requestBody: {
        role: "writer",
        type: "user",
        emailAddress: USER_EMAIL,
      },
    });

    console.log(`✅ Shared presentation with ${USER_EMAIL}`);
  } catch (error) {
    console.error("❌ Error creating presentation:", error.message);
  }
}

// Read user input from command line
const topic = process.argv[2] || "Artificial Intelligence"; // Default topic
createPresentation(topic);
