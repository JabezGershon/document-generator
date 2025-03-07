const fs = require("fs");
const axios = require("axios");
const PDFDocument = require("pdfkit");
const path = require("path");
require("dotenv").config();

// Load API keys from .env
const GOOGLE_SEARCH_API_KEY = process.env.GOOGLE_SEARCH_API_KEY;
const GOOGLE_CX = process.env.GOOGLE_CX;

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

    return (
      response.data.items
        .map((item) => `• ${item.snippet}`) // Add bullet points to each snippet
        .slice(0, 5) // Limit to 5 results
        .join("\n\n") || "No relevant information found."
    );
  } catch (error) {
    console.error(
      "❌ Failed to fetch text:",
      error.response?.data?.error?.message || error.message
    );
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

    return response.data.items[0]?.link || null; // Return the first image URL
  } catch (error) {
    console.error(
      "❌ Failed to fetch image:",
      error.response?.data?.error?.message || error.message
    );
    return null;
  }
}

// Function to generate PDF
async function generatePDF(topic) {
  try {
    // Fetch content from Google
    const textContent = await fetchTextFromGoogle(topic);
    const imageUrl = await fetchImageFromGoogle(topic);

    // Create a PDF document
    const doc = new PDFDocument();
    const fileName = `${topic.replace(/\s+/g, "_")}.pdf`;
    const filePath = path.join(__dirname, "pdfs", fileName);

    // Ensure the "pdfs" directory exists
    if (!fs.existsSync(path.join(__dirname, "pdfs"))) {
      fs.mkdirSync(path.join(__dirname, "pdfs"));
    }

    // Pipe the PDF to a file
    doc.pipe(fs.createWriteStream(filePath));

    // Add title to the PDF
    doc.fontSize(25).text(topic, { align: "center" });
    doc.moveDown();

    // Add text content to the PDF
    doc.fontSize(12).text(textContent, { align: "left" });
    doc.moveDown();

    // Add image to the PDF (if available)
    if (imageUrl) {
      try {
        const imageResponse = await axios.get(imageUrl, { responseType: "arraybuffer" });
        doc.image(imageResponse.data, { width: 400, align: "center" });
      } catch (error) {
        console.error("❌ Failed to add image to PDF:", error.message);
      }
    }

    // Finalize the PDF
    doc.end();

    console.log(`✅ PDF generated: ${filePath}`);
  } catch (error) {
    console.error("❌ Error generating PDF:", error.message);
  }
}

// Read user input from command line
const topic = process.argv[2] || "Artificial Intelligence"; // Default topic
generatePDF(topic);
