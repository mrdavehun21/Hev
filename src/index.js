const express = require("express");
const session = require('express-session');
require('dotenv').config();
const app = express();
const axios = require('axios');
const fs = require('fs');
const rateLimit = require('express-rate-limit');
const path = require('path');

app.use(express.json());
app.use(session({
    secret: '1224',
    resave: false,
    saveUninitialized: false
}));
app.set("view engine", "ejs");
app.use(express.urlencoded({ extended: false }));

app.get("", (req, res) => {
    const loggedIn = req.session ? req.session.loggedIn || false : false;
    res.render('home', { loggedIn });
});

app.get("/home", (req, res) => {
    const loggedIn = req.session ? req.session.loggedIn || false : false;
    res.render("home", { loggedIn });
});

// Apply rate limiting middleware for all routes
const limiter = rateLimit({
    windowMs: 30 * 1000, // 30 seconds
    max: 30, // limit each IP to 30 requests per 30 seconds
    handler: (req, res) => {
        res.status(429).sendFile(path.join(__dirname, '../public', '429.html'));
    }
});

app.use(limiter);

app.use(express.static(path.join(__dirname, '../public')));
//----------------------Vonatok-------------------------------------------//

// Function to match stopId to name
function matchStopIdToName(stopId, stops) {
    const stop = stops[stopId];
    return stop ? stop.name : null;
}

// Function to match tripId to tripHeadsign
function matchTripIdToTripHeadsign(tripId, trips) {
    const trip = trips[tripId];
    return trip ? trip.tripHeadsign : null;
}

// Helper functions
function getCurrentDate() {
    const now = new Date();
    const year = now.getFullYear();
    const month = (now.getMonth() + 1).toString().padStart(2, '0'); // Adding 1 to month as it is 0-indexed
    const day = now.getDate().toString().padStart(2, '0');
    return `${day}-${month}-${year}`;
}

function formatTime(timestamp) {
    return new Date(timestamp * 1000).toLocaleTimeString('hu-HU', {
        timeZone: 'Europe/Budapest',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false
    });
}

//--------------H5------------------//
// Function to fetch data from API
async function fetchDataFromAPIH5() {
    try {
        const apiKey = process.env.API_KEY;
        const vehiclesResponse = await axios.get('https://futar.bkk.hu/api/query/v1/ws/otp/api/where/vehicles-for-route', {
            params: {
                routeId: 'BKK_H5',
                related: false,
                version: 2,
                includeReferences: true,
                key: apiKey
            }
        });

        const vehiclesData = vehiclesResponse.data.data;
        const vehicles = vehiclesData.list.map((vehicle, index) => ({
            index: index + 1,
            vehicleId: vehicle.vehicleId,
            tripId: vehicle.tripId,
            stopId: vehicle.stopId,
            licensePlate: vehicle.licensePlate,
            stopSequence: vehicle.stopSequence,
            status: vehicle.status,
            label: vehicle.label,
            tripHeadsign: matchTripIdToTripHeadsign(vehicle.tripId, vehiclesData.references.trips),
            stopName: matchStopIdToName(vehicle.stopId, vehiclesData.references.stops)
        }));

        const stopsByVehicle = {};
        const stopPromises = vehicles.map(vehicle =>
            axios.get('https://futar.bkk.hu/api/query/v1/ws/otp/api/where/trip-details', {
                params: {
                    vehicleId: vehicle.vehicleId,
                    date: getCurrentDate(),
                    version: 4,
                    includeReferences: true,
                    key: apiKey
                }
            })
        );

        const stopResponses = await Promise.all(stopPromises);

        stopResponses.forEach((stopResponse, i) => {
            stopsByVehicle[vehicles[i].vehicleId] = stopResponse.data.data.entry.stopTimes.map(stop => ({
                stopId: matchStopIdToName(stop.stopId, stopResponse.data.data.references.stops),
                stopSequence: stop.stopSequence,
                predictedArrivalTime: formatTime(stop.predictedArrivalTime),
                predictedDepartureTime: formatTime(stop.predictedDepartureTime),
                arrivalTime: formatTime(stop.arrivalTime),
                departureTime: formatTime(stop.departureTime)
            }));
        });

        app.locals.vehiclesH5 = vehicles;
        app.locals.stopsByVehicleH5 = stopsByVehicle;
        app.locals.currentDateH5 = getCurrentDate();
    } catch (error) {
        console.error('Error fetching data:', error);
    }
}

async function startFetchingDataH5() {
    await fetchDataFromAPIH5();
    setInterval(fetchDataFromAPIH5, 30000);
}

// Start fetching data
startFetchingDataH5();

// Routes
app.get('/home/vonatokH5', (req, res) => {
    try {
        const vehiclesH5 = app.locals.vehiclesH5 || [];
        const stopsByVehicleH5 = app.locals.stopsByVehicleH5 || {};
        const selectedDirectionH5 = req.session.selectedDirectionH5 || '';
        const licensePlatesData = JSON.parse(fs.readFileSync('./data/licensePlates.json', 'utf8'));
        res.render('vonatokH5', { vehiclesH5, stopsByVehicleH5, selectedDirectionH5, licensePlates: licensePlatesData });
    } catch (error) {
        console.error('Error rendering page:', error);
        res.status(500).sendFile(path.join(__dirname, 'public', '500.html'));
    }
});

app.post('/home/vonatokH5', (req, res) => {
    try {
        req.session.selectedDirectionH5 = req.body.selectedDirectionH5;
        res.redirect('/home/vonatokH5');
    } catch (error) {
        console.error('Error processing filter:', error);
        res.status(500).sendFile(path.join(__dirname, 'public', '500.html'));
    }
});

//----------------------Vonatok_END-------------------------------------------//


//----------------------Bejelentkezés, Regisztráció------------------//
app.get('/logout', (req, res) => {
    req.session.destroy(err => {
        if (err) {
            console.error('Error destroying session:', err);
            res.status(500).send('Error logging out');
        } else {
            res.redirect('/home');
        }
    });
});

const { MongoClient } = require('mongodb');

// Connection URI
const uri = process.env.URI;

// Create a new MongoClient
const client = new MongoClient(uri, {
});

let db;

async function connectToMongoDB() {
  try {
    // Connect the client to the server
    await client.connect();
    console.log("Connected to MongoDB!");

    // Select the database
    db = client.db("RapidTrack");
  } catch (error) {
    console.error("Error connecting to MongoDB:", error);
  }
}

// Call the function to establish connection
connectToMongoDB();

app.post("/login", async (req, res) => {
    const { name, password } = req.body;
    try {
        const user = await db.collection('loginCollection').findOne({ name });

        if (user && user.password === password && req.headers.referer.includes('/login')) {
            req.session.loggedIn = true; // Set loggedIn flag
            res.redirect("/home");
        } else {
            res.send("Wrong username or password!");
        }
    } catch (error) {
        console.error("Error during login:", error);
        res.status(500).send("Error during login");
    }
});

app.post("/signup", async (req, res) => {
    const data = {
        name: req.body.name,
        password: req.body.password
    };

    try {
        await db.collection('loginCollection').insertOne(data);
        console.log("User created successfully:", data);
        res.redirect("/login");
    } catch (error) {
        console.error("Error creating user:", error);
        // Handle error
        res.status(500).send("Error creating user");
    }
});

app.get("/login", (req, res) => {
    res.render("login");
});

app.get("/signup", (req, res) => {
    res.render("signup");
});

// Custom error handling middleware for catching other errors
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).sendFile(path.join(__dirname, '../public', '500.html'));
});

// 404 handler (should be placed after all other routes)
app.use((req, res) => {
    res.status(404).sendFile(path.join(__dirname, '../public', '404.html'));
});

const PORT = process.env.PORT || 3000; // Use environment port or default to 3000
var server = app.listen(PORT, () => {
    server.setTimeout(500000); // Set timeout to 500 seconds (500,000 milliseconds)
    console.log(`Server is running on port ${PORT}`);
});