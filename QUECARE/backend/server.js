
// Import required packages
const express = require("express");
const cors = require("cors");

// Create Express application
const app = express();

// Set the server port
const PORT = 5000;

// Middleware
app.use(cors());
app.use(express.json());

// Home route
app.get("/", (req, res) => {
    res.send("Welcome to QUECARE Backend Server!");
});

// Health check route
app.get("/api/health", (req, res) => {
    res.json({
        success: true,
        message: "QUECARE backend is running successfully!"
    });
});

// Handle unknown routes
app.use((req, res) => {
    res.status(404).json({
        success: false,
        message: "API route not found"
    });
});

// Start the server
app.listen(PORT, () => {
    console.log(`QUECARE server running at http://localhost:${PORT}`);
});
