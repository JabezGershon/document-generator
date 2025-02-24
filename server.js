require('dotenv').config();
const express = require('express');
const axios = require('axios');
const fs = require('fs');
const PDFDocument = require('pdfkit');
const path = require('path');
const { createWriteStream } = require('fs');
const { promisify } = require('util');
const stream = require('stream');

const app = express();
const PORT = process.env.PORT || 3000;
const GOOGLE_API_KEY = process.env.GOOGLE_API_KEY;
const UNSPLASH_ACCESS_KEY = process.env.UNSPLASH_ACCESS_KEY;
const GOOGLE_API_URL = `https://generativelanguage.googleapis.com/v1/models/gemini-pro:generateContent?key=${GOOGLE_API_KEY}`;
const UNSPLASH_API_URL = `https://api.unsplash.com/search/photos`;

app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static('public'));

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

async function fetchImage(topic) {
    try {
        const response = await axios.get(UNSPLASH_API_URL, {
            params: { query: topic, orientation: 'landscape', per_page: 1 },
            headers: { Authorization: `Client-ID ${UNSPLASH_ACCESS_KEY}` }
        });
        
        if (response.data.results.length > 0) {
            return response.data.results[0].urls.regular;
        } else {
            console.error('No relevant image found.');
            return null;
        }
    } catch (error) {
        console.error('Error fetching image:', error.response?.data || error.message);
        return null;
    }
}

async function downloadImage(imageUrl, filename) {
    try {
        const imagePath = path.join(__dirname, 'public', 'images', filename);
        const response = await axios({ url: imageUrl, responseType: 'stream' });
        const pipeline = promisify(stream.pipeline);
        await pipeline(response.data, createWriteStream(imagePath));
        return imagePath;
    } catch (error) {
        console.error('Error downloading image:', error.message);
        return null;
    }
}

app.post('/generate-pdf', async (req, res) => {
    const { topic } = req.body;
    if (!topic) return res.status(400).send('Topic is required');

    try {
        const response = await axios.post(GOOGLE_API_URL, {
            contents: [{ parts: [{ text: `Write a structured article on "${topic}" in Markdown format using proper headings and bold formatting.` }] }]
        });

        let text = response.data.candidates?.[0]?.content?.parts?.[0]?.text || 'No content generated.';
        text = text.replace(/^# (.*)/gm, '**$1**')
                   .replace(/^### (.*)/gm, '**$1**')
                   .replace(/^- (.*)/gm, '• **$1**');

        const fileName = `${topic.replace(/\s+/g, '_')}.pdf`;
        const filePath = path.join(__dirname, 'public', 'pdfs', fileName);
        const imageFilename = `${topic.replace(/\s+/g, '_')}.jpg`;

        const imageUrl = await fetchImage(topic);
        const localImagePath = imageUrl ? await downloadImage(imageUrl, imageFilename) : null;

        const doc = new PDFDocument({ size: 'A4', margin: 50 });
        doc.pipe(fs.createWriteStream(filePath));
        
        if (localImagePath) {
            doc.image(localImagePath, {
                width: 595,
                height: 842,
                align: 'center',
                valign: 'center',
                opacity: 0.2
            });
        }

        doc.rect(0, 0, doc.page.width, doc.page.height)
            .fillOpacity(0.6)
            .fill('white');

        text = text.replace(new RegExp(`\\*\\*${topic}\\*\\*`, 'gi'), '');

        doc.fillColor('black').font('Helvetica-Bold').fontSize(22).text(topic, { align: 'center' }).moveDown(1.5);

        doc.rect(50, 50, 495, 742).fillOpacity(0.7).fill('white');

        doc.fillColor('black').font('Helvetica-Bold').fontSize(22).text(topic, { align: 'center' }).moveDown(1.5);
        
        text.split('\n').forEach(line => {
            const trimmedLine = line.trim();
            
            if (/^\*\*(.*?)\*\*$/.test(trimmedLine)) {
                doc.font('Helvetica-Bold').fontSize(14).text(trimmedLine.replace(/\*\*/g, ''), { align: 'left' }).moveDown(0.7);
            } else if (/^• \*\*(.*?)\*\*/.test(trimmedLine)) {
                doc.font('Helvetica-Bold').fontSize(12).text(trimmedLine.replace(/\*\*/g, ''), { align: 'left' }).moveDown(0.3);
            } else if (/^• /.test(trimmedLine)) {
                doc.font('Helvetica').fontSize(12).text(trimmedLine, { align: 'left' }).moveDown(0.3);
            } else if (trimmedLine.length > 0) {
                doc.font('Helvetica').fontSize(12).text(trimmedLine, { align: 'justify' }).moveDown(0.5);
            }
        });
        
        doc.end();
        res.json({ pdfUrl: `/pdfs/${fileName}` });
    } catch (error) {
        console.error('Error generating text:', error);
        res.status(500).send('Failed to generate content.');
    }
});

app.listen(PORT, () => console.log(`🚀 Server running on http://localhost:${PORT}`));

const pdfDir = path.join(__dirname, 'public', 'pdfs');
if (!fs.existsSync(pdfDir)) {
    fs.mkdirSync(pdfDir, { recursive: true });
}

const imageDir = path.join(__dirname, 'public', 'images');
if (!fs.existsSync(imageDir)) {
    fs.mkdirSync(imageDir, { recursive: true });
}
