const express = require("express");
const session = require('express-session');
const Collection = require("./mongoDB");
require('dotenv').config();
const app = express();
const axios = require('axios');
const fs = require('fs');

app.use(express.json());
app.use(session({
    secret: '1224',
    resave: false,
    saveUninitialized: false
}));
app.set("view engine", "ejs");
app.use(express.urlencoded({ extended: false }));
app.use(express.static('public'));


app.get("", (req, res) => {
    const loggedIn = req.session ? req.session.loggedIn || false : false;
    res.render('home', { loggedIn });
});

app.get("/login", (req, res) => {
    res.render("login");
});

app.get("/signup", (req, res) => {
    res.render("signup");
});

app.get("/home", (req, res) => {
    const loggedIn = req.session ? req.session.loggedIn || false : false;
    res.render('home', { loggedIn });
});
//----------------------Vonatok------------------//

function matchStopIdToName(stopId, stops) {
    const stop = stops[stopId];
    return stop ? stop.name : null;
}

function matchTripIdToTripHeadsign(tripId, trips) {
    const trip = trips[tripId];
    return trip ? trip.tripHeadsign : null;
}
const apiKey = process.env.API_KEY;
app.get('/home/vonatok', async (req, res) => {
    try {
        const vehiclesResponse = await axios.get('https://futar.bkk.hu/api/query/v1/ws/otp/api/where/vehicles-for-route', {
            params: {
                routeId: 'BKK_H5',
                related: false,
                ifModifiedSince: 1625685137,
                appVersion: '1.1.abc',
                version: 2,
                includeReferences: true,
                key: apiKey
            }
        });
        const vehiclesData = vehiclesResponse.data;

        // Extracting license plate section and matching tripId to tripHeadsign
        const vehicles = vehiclesData.data.list.map((vehicle, index) => ({
            index: index + 1, // Adding 1 to start index from 1
            vehicleId: vehicle.vehicleId,
            tripId: vehicle.tripId,
            stopId: vehicle.stopId,
            licensePlate: vehicle.licensePlate,
            status: vehicle.status,
            tripHeadsign: matchTripIdToTripHeadsign(vehicle.tripId, vehiclesData.data.references.trips),
            stopName: matchStopIdToName(vehicle.stopId, vehiclesData.data.references.stops)
        }));

        const vehicleIds = [];
        vehicles.forEach(vehicle => {
            vehicleIds.push(vehicle.vehicleId);
        });

        const stopPromises = [];

        //Date for navbar
        function getCurrentDate() {
            const now = new Date();
            const year = now.getFullYear();
            const monthNames = ["Január", "Február", "Március", "Április", "Május", "Június",
                "Július", "Augusztus", "Szeptember", "Október", "November", "December"];
            const month = monthNames[now.getMonth()];
            const day = now.getDate().toString().padStart(2, '0');
            return `${day} ${month} ${year}`;
        }
        
        function getDateForDesign(){
            const now = new Date();
            const options = {
                hour12: false,
                timeZone: 'Europe/Budapest',
                hour: '2-digit',
                minute: '2-digit',
                weekday: 'long',
                month: 'long',
                day: 'numeric'
            };
            let formattedDate = now.toLocaleString('hu-HU', options);
            formattedDate = formattedDate.replace(/^\p{L}/u, c => c.toUpperCase());
            return formattedDate;
        }
        
        const currentDate = getCurrentDate();
        const dateForDesign = getDateForDesign();
        //Date for navbar end

        // Iterate over each vehicleId and make a request
        for (const vehicle of vehicles) {
            const stopPromise = axios.get('https://futar.bkk.hu/api/query/v1/ws/otp/api/where/trip-details', {
                params: {
                    vehicleId: vehicle.vehicleId,
                    date: currentDate,
                    ifModifiedSince: 1625685137,
                    appVersion: '1.1.abc',
                    version: 4,
                    includeReferences: true,
                    key: apiKey
                }
            });

            stopPromises.push(stopPromise);
        }

        // Wait for all requests to complete
        const stopResponses = await Promise.all(stopPromises);

        // Create an object to store stops data indexed by vehicleId
        const stopsByVehicle = {};

        // Process each stop response
        for (let i = 0; i < stopResponses.length; i++) {
            const stopResponse = stopResponses[i];
            const vehicleId = vehicles[i].vehicleId;
            const stopTimesData = stopResponse.data;

            // Extract stops data for this vehicleId
            const stopsData = stopTimesData.data.entry.stopTimes.map(stop => ({
                stopId: matchStopIdToName(stop.stopId, stopTimesData.data.references.stops),
                stopHeadsign: stop.stopHeadsign,
                stopTimes: stop.stopTimes,
                predictedArrivalTime: new Date(stop.predictedArrivalTime * 1000).toLocaleTimeString('hu-HU', {timeZone: 'Europe/Budapest', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }),
                predictedDepartureTime: new Date(stop.predictedDepartureTime * 1000).toLocaleTimeString('hu-HU', {timeZone: 'Europe/Budapest', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })
            }));

            // Store stops data indexed by vehicleId
            stopsByVehicle[vehicleId] = stopsData;
        }

        //DirectionFilter
        const selectedDirection = req.session.selectedDirection || '';

        const licensePlatesData = JSON.parse(fs.readFileSync('./data/licensePlates.json', 'utf8'));

        // Render the EJS file with the data
        res.render('vonatok', { vehicles, stopsByVehicle, currentDate, dateForDesign, selectedDirection, licensePlates: licensePlatesData });
    } catch (error) 
    {
        console.error('Error fetching data:', error);
        res.status(500).send('Error fetching data');
    }
});

app.post('/home/vonatok', async (req, res) => {
    try {
        // Store the selected tripheadsign in the session
        req.session.selectedDirection = req.body.selectedDirection;
        // Redirect back to the vonatok page
        res.redirect('/home/vonatok');
    } catch (error) {
        console.error('Error processing filter:', error);
        res.status(500).send('Error processing filter');
    }
});
//-------------------------------------------------------------//

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

app.post("/login", async (req, res) => {
    try {
        const check = await Collection.findOne({ name: req.body.name });

        if (check && check.password === req.body.password && req.headers.referer.includes('/login')) {
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
        await Collection.create(data);
        console.log("User created successfully:", data);
        res.redirect("/login");
    } catch (error) {
        console.error("Error creating user:", error);
        // Handle error
        res.status(500).send("Error creating user");
    }
});

const PORT = process.env.PORT || 3000; // Use environment port or default to 3000
var server = app.listen(PORT, () => {
    server.setTimeout(500000); // Set timeout to 500 seconds (500,000 milliseconds)
    console.log(`Server is running on port ${PORT}`);
});