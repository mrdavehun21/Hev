const express = require("express");
const session = require('express-session');
require('dotenv').config();
const app = express();
const axios = require('axios');
const fs = require('fs');
const rateLimit = require('express-rate-limit');

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

app.get("/home", (req, res) => {
    const loggedIn = req.session ? req.session.loggedIn || false : false;
    res.render("home", { loggedIn });
});

// Apply rate limiting middleware for all routes
const limiter = rateLimit({
    windowMs: 30 * 1000, // 30 seconds
    max: 20, // limit each IP to 10 requests per 30 seconds
    message: 'Too many requests from this IP, please try again 30 seconds later'
});

app.use(limiter);

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

//--------------H5------------------//
// Function to fetch data from API
async function fetchDataFromAPIH5() {
    try {
        const apiKey = process.env.API_KEY;
        const vehiclesResponse = await axios.get('https://futar.bkk.hu/api/query/v1/ws/otp/api/where/vehicles-for-route', {
            params: {
                routeId: 'BKK_H5',
                related: false,
                appVersion: '1.1.abc',
                version: 2,
                includeReferences: true,
                key: apiKey
            }
        });
        const vehiclesData = vehiclesResponse.data;

        // Extracting license plate section and matching tripId to tripHeadsign
        const vehicles = vehiclesData.data.list.map((vehicle, index) => ({
            index: index + 1,
            vehicleId: vehicle.vehicleId,
            tripId: vehicle.tripId,
            stopId: vehicle.stopId,
            licensePlate: vehicle.licensePlate,
            stopSequence: vehicle.stopSequence,
            status: vehicle.status,
            label: vehicle.label,
            tripHeadsign: matchTripIdToTripHeadsign(vehicle.tripId, vehiclesData.data.references.trips),
            stopName: matchStopIdToName(vehicle.stopId, vehiclesData.data.references.stops)
        }));

        // Create stopsByVehicle object to store stops data indexed by vehicleId
        const stopsByVehicle = {};

        // Array to store promises for each vehicle's stop data
        const stopPromises = [];

        // Iterate over each vehicleId and make a request
        for (const vehicle of vehicles) {
            const stopPromise = axios.get('https://futar.bkk.hu/api/query/v1/ws/otp/api/where/trip-details', {
                params: {
                    vehicleId: vehicle.vehicleId,
                    date: getCurrentDate(), // Fetching current date
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

        // Process each stop response
        for (let i = 0; i < stopResponses.length; i++) {
            const stopResponse = stopResponses[i];
            const vehicleId = vehicles[i].vehicleId;
            const stopTimesData = stopResponse.data;

            // Extract stops data for this vehicleId
            const stopsData = stopTimesData.data.entry.stopTimes.map(stop => ({
                stopId: matchStopIdToName(stop.stopId, stopTimesData.data.references.stops),
                stopSequence: stop.stopSequence,
                predictedArrivalTime: new Date(stop.predictedArrivalTime * 1000).toLocaleTimeString('hu-HU', {timeZone: 'Europe/Budapest', hour: '2-digit', minute: '2-digit', hour12: false }),
                predictedDepartureTime: new Date(stop.predictedDepartureTime * 1000).toLocaleTimeString('hu-HU', {timeZone: 'Europe/Budapest', hour: '2-digit', minute: '2-digit', hour12: false }),
                arrivalTime: new Date(stop.arrivalTime * 1000).toLocaleTimeString('hu-HU', {timeZone: 'Europe/Budapest', hour: '2-digit', minute: '2-digit', hour12: false })
            }));

            // Store stops data indexed by vehicleId
            stopsByVehicle[vehicleId] = stopsData;
        }

        const currentDate = getCurrentDate();

        // Store the data in session
        app.locals.vehiclesH5 = vehicles;
        app.locals.stopsByVehicleH5 = stopsByVehicle;
        app.locals.currentDateH5 = currentDate;

        // // Log details of the first vehicle
        // if (vehicles.length > 0) {
        //     const firstVehicle = vehicles[1];
        //     console.log('Details of the first vehicle:', firstVehicle);
        // }
        // Date functions
        function getCurrentDate() {
            const now = new Date();
            const year = now.getFullYear();
            const monthNames = ["Január", "Február", "Március", "Április", "Május", "Június",
                "Július", "Augusztus", "Szeptember", "Október", "November", "December"];
            const month = monthNames[now.getMonth()];
            const day = now.getDate().toString().padStart(2, '0');
            return `${day} ${month} ${year}`;
        }

    } catch (error) {
        console.error('Error fetching data:', error);
    }
}

// Function to fetch data from API and start interval
async function startFetchingDataH5() {
    // Fetch data immediately
    await fetchDataFromAPIH5();

    // Set interval to fetch data every 30 seconds
    setInterval(async () => {
        await fetchDataFromAPIH5();
    }, 30000); // 30 seconds in milliseconds
}

// Start fetching data
startFetchingDataH5();

// Routes
app.get('/home/vonatokH5', async (req, res) => {
    try {
        const vehiclesH5 = app.locals.vehiclesH5 || [];
        const stopsByVehicleH5 = app.locals.stopsByVehicleH5 || {};
        const selectedDirectionH5 = req.session.selectedDirectionH5 || '';
        const licensePlatesData = JSON.parse(fs.readFileSync('./data/licensePlates.json', 'utf8'));

        // Render the EJS file with the data
        res.render('vonatokH5', { vehiclesH5, stopsByVehicleH5, selectedDirectionH5, licensePlates: licensePlatesData });
    } catch (error) {
        console.error('Error rendering page:', error);
        res.status(500).send('Error rendering page');
    }
});

app.post('/home/vonatokH5', async (req, res) => {
    try {
        // Store the selected tripheadsign in the session
        req.session.selectedDirectionH5 = req.body.selectedDirectionH5;
        // Redirect back to the vonatok page
        res.redirect('/home/vonatokH5');
    } catch (error) {
        console.error('Error processing filter:', error);
        res.status(500).send('Error processing filter');
    }
});

//--------------H6------------------//
// Function to fetch data from API
async function fetchDataFromAPIH6() {
    try {
        const apiKey = process.env.API_KEY;
        const vehiclesResponse = await axios.get('https://futar.bkk.hu/api/query/v1/ws/otp/api/where/vehicles-for-route', {
            params: {
                routeId: 'BKK_H6',
                related: false,
                appVersion: '1.1.abc',
                version: 2,
                includeReferences: true,
                key: apiKey
            }
        });
        const vehiclesData = vehiclesResponse.data;

        // Extracting license plate section and matching tripId to tripHeadsign
        const vehicles = vehiclesData.data.list.map((vehicle, index) => ({
            index: index + 1,
            vehicleId: vehicle.vehicleId,
            tripId: vehicle.tripId,
            stopId: vehicle.stopId,
            licensePlate: vehicle.licensePlate,
            stopSequence: vehicle.stopSequence,
            status: vehicle.status,
            label: vehicle.label,
            tripHeadsign: matchTripIdToTripHeadsign(vehicle.tripId, vehiclesData.data.references.trips),
            stopName: matchStopIdToName(vehicle.stopId, vehiclesData.data.references.stops)
        }));

        // Create stopsByVehicle object to store stops data indexed by vehicleId
        const stopsByVehicle = {};

        // Array to store promises for each vehicle's stop data
        const stopPromises = [];

        // Iterate over each vehicleId and make a request
        for (const vehicle of vehicles) {
            const stopPromise = axios.get('https://futar.bkk.hu/api/query/v1/ws/otp/api/where/trip-details', {
                params: {
                    vehicleId: vehicle.vehicleId,
                    date: getCurrentDate(), // Fetching current date
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

        // Process each stop response
        for (let i = 0; i < stopResponses.length; i++) {
            const stopResponse = stopResponses[i];
            const vehicleId = vehicles[i].vehicleId;
            const stopTimesData = stopResponse.data;

            // Extract stops data for this vehicleId
            const stopsData = stopTimesData.data.entry.stopTimes.map(stop => ({
                stopId: matchStopIdToName(stop.stopId, stopTimesData.data.references.stops),
                stopSequence: stop.stopSequence,
                predictedArrivalTime: new Date(stop.predictedArrivalTime * 1000).toLocaleTimeString('hu-HU', {timeZone: 'Europe/Budapest', hour: '2-digit', minute: '2-digit', hour12: false }),
                predictedDepartureTime: new Date(stop.predictedDepartureTime * 1000).toLocaleTimeString('hu-HU', {timeZone: 'Europe/Budapest', hour: '2-digit', minute: '2-digit', hour12: false })
            }));

            // Store stops data indexed by vehicleId
            stopsByVehicle[vehicleId] = stopsData;
        }

        const currentDate = getCurrentDate();

        // Store the data in session
        app.locals.vehiclesH6 = vehicles;
        app.locals.stopsByVehicleH6 = stopsByVehicle;
        app.locals.currentDateH6 = currentDate;

        // Date functions
        function getCurrentDate() {
            const now = new Date();
            const year = now.getFullYear();
            const monthNames = ["Január", "Február", "Március", "Április", "Május", "Június",
                "Július", "Augusztus", "Szeptember", "Október", "November", "December"];
            const month = monthNames[now.getMonth()];
            const day = now.getDate().toString().padStart(2, '0');
            return `${day} ${month} ${year}`;
        }

    } catch (error) {
        console.error('Error fetching data:', error);
    }
}
// Function to fetch data from API and start interval
async function startFetchingDataH6() {
    // Fetch data immediately
    await fetchDataFromAPIH6();

    // Set interval to fetch data every 30 seconds
    setInterval(async () => {
        await fetchDataFromAPIH6();
    }, 30000); // 30 seconds in milliseconds
}

// Start fetching data
startFetchingDataH6();

// Routes
app.get('/home/vonatokH6', async (req, res) => {
    try {
        const vehiclesH6 = app.locals.vehiclesH6 || [];
        const stopsByVehicleH6 = app.locals.stopsByVehicleH6 || {};
        const selectedDirectionH6 = req.session.selectedDirectionH6 || '';

        res.render('vonatokH6', { vehiclesH6, stopsByVehicleH6, selectedDirectionH6 });
    } catch (error) {
        console.error('Error rendering page:', error);
        res.status(500).send('Error rendering page');
    }
});
app.post('/home/vonatokH6', async (req, res) => {
    try {
        req.session.selectedDirectionH6 = req.body.selectedDirectionH6;

        res.redirect('/home/vonatokH6');
    } catch (error) {
        console.error('Error processing filter:', error);
        res.status(500).send('Error processing filter');
    }
});

//--------------H7------------------//
// Function to fetch data from API
async function fetchDataFromAPIH7() {
    try {
        const apiKey = process.env.API_KEY;
        const vehiclesResponse = await axios.get('https://futar.bkk.hu/api/query/v1/ws/otp/api/where/vehicles-for-route', {
            params: {
                routeId: 'BKK_H7',
                related: false,
                appVersion: '1.1.abc',
                version: 2,
                includeReferences: true,
                key: apiKey
            }
        });
        const vehiclesData = vehiclesResponse.data;

        // Extracting license plate section and matching tripId to tripHeadsign
        const vehicles = vehiclesData.data.list.map((vehicle, index) => ({
            index: index + 1,
            vehicleId: vehicle.vehicleId,
            tripId: vehicle.tripId,
            stopId: vehicle.stopId,
            licensePlate: vehicle.licensePlate,
            stopSequence: vehicle.stopSequence,
            status: vehicle.status,
            label: vehicle.label,
            tripHeadsign: matchTripIdToTripHeadsign(vehicle.tripId, vehiclesData.data.references.trips),
            stopName: matchStopIdToName(vehicle.stopId, vehiclesData.data.references.stops)
        }));

        // Create stopsByVehicle object to store stops data indexed by vehicleId
        const stopsByVehicle = {};

        // Array to store promises for each vehicle's stop data
        const stopPromises = [];

        // Iterate over each vehicleId and make a request
        for (const vehicle of vehicles) {
            const stopPromise = axios.get('https://futar.bkk.hu/api/query/v1/ws/otp/api/where/trip-details', {
                params: {
                    vehicleId: vehicle.vehicleId,
                    date: getCurrentDate(), // Fetching current date
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

        // Process each stop response
        for (let i = 0; i < stopResponses.length; i++) {
            const stopResponse = stopResponses[i];
            const vehicleId = vehicles[i].vehicleId;
            const stopTimesData = stopResponse.data;

            // Extract stops data for this vehicleId
            const stopsData = stopTimesData.data.entry.stopTimes.map(stop => ({
                stopId: matchStopIdToName(stop.stopId, stopTimesData.data.references.stops),
                stopSequence: stop.stopSequence,
                predictedArrivalTime: new Date(stop.predictedArrivalTime * 1000).toLocaleTimeString('hu-HU', {timeZone: 'Europe/Budapest', hour: '2-digit', minute: '2-digit', hour12: false }),
                predictedDepartureTime: new Date(stop.predictedDepartureTime * 1000).toLocaleTimeString('hu-HU', {timeZone: 'Europe/Budapest', hour: '2-digit', minute: '2-digit', hour12: false })
            }));

            // Store stops data indexed by vehicleId
            stopsByVehicle[vehicleId] = stopsData;
        }

        const currentDate = getCurrentDate();

        // Store the data in session
        app.locals.vehiclesH7 = vehicles;
        app.locals.stopsByVehicleH7 = stopsByVehicle;
        app.locals.currentDateH7 = currentDate;

        // Date functions
        function getCurrentDate() {
            const now = new Date();
            const year = now.getFullYear();
            const monthNames = ["Január", "Február", "Március", "Április", "Május", "Június",
                "Július", "Augusztus", "Szeptember", "Október", "November", "December"];
            const month = monthNames[now.getMonth()];
            const day = now.getDate().toString().padStart(2, '0');
            return `${day} ${month} ${year}`;
        }

    } catch (error) {
        console.error('Error fetching data:', error);
    }
}
// Function to fetch data from API and start interval
async function startFetchingDataH7() {
    // Fetch data immediately
    await fetchDataFromAPIH7();

    // Set interval to fetch data every 30 seconds
    setInterval(async () => {
        await fetchDataFromAPIH7();
    }, 30000); // 30 seconds in milliseconds
}

// Start fetching data
startFetchingDataH7();

// Routes
app.get('/home/vonatokH7', async (req, res) => {
    try {
        const vehiclesH7 = app.locals.vehiclesH7 || [];
        const stopsByVehicleH7 = app.locals.stopsByVehicleH7 || {};
        const selectedDirectionH7 = req.session.selectedDirectionH7 || '';

        res.render('vonatokH7', { vehiclesH7, stopsByVehicleH7, selectedDirectionH7 });
    } catch (error) {
        console.error('Error rendering page:', error);
        res.status(500).send('Error rendering page');
    }
});
app.post('/home/vonatokH7', async (req, res) => {
    try {
        req.session.selectedDirectionH7 = req.body.selectedDirectionH7;

        res.redirect('/home/vonatokH7');
    } catch (error) {
        console.error('Error processing filter:', error);
        res.status(500).send('Error processing filter');
    }
});

//--------------H8------------------//
// Function to fetch data from API
async function fetchDataFromAPIH8() {
    try {
        const apiKey = process.env.API_KEY;
        const vehiclesResponse = await axios.get('https://futar.bkk.hu/api/query/v1/ws/otp/api/where/vehicles-for-route', {
            params: {
                routeId: 'BKK_H8',
                related: false,
                appVersion: '1.1.abc',
                version: 2,
                includeReferences: true,
                key: apiKey
            }
        });
        const vehiclesData = vehiclesResponse.data;

        // Extracting license plate section and matching tripId to tripHeadsign
        const vehicles = vehiclesData.data.list.map((vehicle, index) => ({
            index: index + 1,
            vehicleId: vehicle.vehicleId,
            tripId: vehicle.tripId,
            stopId: vehicle.stopId,
            licensePlate: vehicle.licensePlate,
            stopSequence: vehicle.stopSequence,
            status: vehicle.status,
            label: vehicle.label,
            tripHeadsign: matchTripIdToTripHeadsign(vehicle.tripId, vehiclesData.data.references.trips),
            stopName: matchStopIdToName(vehicle.stopId, vehiclesData.data.references.stops)
        }));

        // Create stopsByVehicle object to store stops data indexed by vehicleId
        const stopsByVehicle = {};

        // Array to store promises for each vehicle's stop data
        const stopPromises = [];

        // Iterate over each vehicleId and make a request
        for (const vehicle of vehicles) {
            const stopPromise = axios.get('https://futar.bkk.hu/api/query/v1/ws/otp/api/where/trip-details', {
                params: {
                    vehicleId: vehicle.vehicleId,
                    date: getCurrentDate(), // Fetching current date
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

        // Process each stop response
        for (let i = 0; i < stopResponses.length; i++) {
            const stopResponse = stopResponses[i];
            const vehicleId = vehicles[i].vehicleId;
            const stopTimesData = stopResponse.data;

            // Extract stops data for this vehicleId
            const stopsData = stopTimesData.data.entry.stopTimes.map(stop => ({
                stopId: matchStopIdToName(stop.stopId, stopTimesData.data.references.stops),
                stopSequence: stop.stopSequence,
                predictedArrivalTime: new Date(stop.predictedArrivalTime * 1000).toLocaleTimeString('hu-HU', {timeZone: 'Europe/Budapest', hour: '2-digit', minute: '2-digit', hour12: false }),
                predictedDepartureTime: new Date(stop.predictedDepartureTime * 1000).toLocaleTimeString('hu-HU', {timeZone: 'Europe/Budapest', hour: '2-digit', minute: '2-digit', hour12: false })
            }));

            // Store stops data indexed by vehicleId
            stopsByVehicle[vehicleId] = stopsData;
        }

        const currentDate = getCurrentDate();

        // Store the data in session
        app.locals.vehiclesH8 = vehicles;
        app.locals.stopsByVehicleH8 = stopsByVehicle;
        app.locals.currentDateH8 = currentDate;

        // Date functions
        function getCurrentDate() {
            const now = new Date();
            const year = now.getFullYear();
            const monthNames = ["Január", "Február", "Március", "Április", "Május", "Június",
                "Július", "Augusztus", "Szeptember", "Október", "November", "December"];
            const month = monthNames[now.getMonth()];
            const day = now.getDate().toString().padStart(2, '0');
            return `${day} ${month} ${year}`;
        }

    } catch (error) {
        console.error('Error fetching data:', error);
    }
}
// Function to fetch data from API and start interval
async function startFetchingDataH8() {
    // Fetch data immediately
    await fetchDataFromAPIH8();

    // Set interval to fetch data every 30 seconds
    setInterval(async () => {
        await fetchDataFromAPIH8();
    }, 30000); // 30 seconds in milliseconds
}

// Start fetching data
startFetchingDataH8();

// Routes
app.get('/home/vonatokH8', async (req, res) => {
    try {
        const vehiclesH8 = app.locals.vehiclesH8 || [];
        const stopsByVehicleH8 = app.locals.stopsByVehicleH8 || {};
        const selectedDirectionH8 = req.session.selectedDirectionH8 || '';

        res.render('vonatokH8', { vehiclesH8, stopsByVehicleH8, selectedDirectionH8 });
    } catch (error) {
        console.error('Error rendering page:', error);
        res.status(500).send('Error rendering page');
    }
});
app.post('/home/vonatokH8', async (req, res) => {
    try {
        req.session.selectedDirectionH8 = req.body.selectedDirectionH8;

        res.redirect('/home/vonatokH8');
    } catch (error) {
        console.error('Error processing filter:', error);
        res.status(500).send('Error processing filter');
    }
});

//--------------H9------------------//
// Function to fetch data from API
async function fetchDataFromAPIH9() {
    try {
        const apiKey = process.env.API_KEY;
        const vehiclesResponse = await axios.get('https://futar.bkk.hu/api/query/v1/ws/otp/api/where/vehicles-for-route', {
            params: {
                routeId: 'BKK_H9',
                related: false,
                appVersion: '1.1.abc',
                version: 2,
                includeReferences: true,
                key: apiKey
            }
        });
        const vehiclesData = vehiclesResponse.data;

        // Extracting license plate section and matching tripId to tripHeadsign
        const vehicles = vehiclesData.data.list.map((vehicle, index) => ({
            index: index + 1,
            vehicleId: vehicle.vehicleId,
            tripId: vehicle.tripId,
            stopId: vehicle.stopId,
            licensePlate: vehicle.licensePlate,
            stopSequence: vehicle.stopSequence,
            status: vehicle.status,
            label: vehicle.label,
            tripHeadsign: matchTripIdToTripHeadsign(vehicle.tripId, vehiclesData.data.references.trips),
            stopName: matchStopIdToName(vehicle.stopId, vehiclesData.data.references.stops)
        }));

        // Create stopsByVehicle object to store stops data indexed by vehicleId
        const stopsByVehicle = {};

        // Array to store promises for each vehicle's stop data
        const stopPromises = [];

        // Iterate over each vehicleId and make a request
        for (const vehicle of vehicles) {
            const stopPromise = axios.get('https://futar.bkk.hu/api/query/v1/ws/otp/api/where/trip-details', {
                params: {
                    vehicleId: vehicle.vehicleId,
                    date: getCurrentDate(), // Fetching current date
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

        // Process each stop response
        for (let i = 0; i < stopResponses.length; i++) {
            const stopResponse = stopResponses[i];
            const vehicleId = vehicles[i].vehicleId;
            const stopTimesData = stopResponse.data;

            // Extract stops data for this vehicleId
            const stopsData = stopTimesData.data.entry.stopTimes.map(stop => ({
                stopId: matchStopIdToName(stop.stopId, stopTimesData.data.references.stops),
                stopSequence: stop.stopSequence,
                predictedArrivalTime: new Date(stop.predictedArrivalTime * 1000).toLocaleTimeString('hu-HU', {timeZone: 'Europe/Budapest', hour: '2-digit', minute: '2-digit', hour12: false }),
                predictedDepartureTime: new Date(stop.predictedDepartureTime * 1000).toLocaleTimeString('hu-HU', {timeZone: 'Europe/Budapest', hour: '2-digit', minute: '2-digit', hour12: false })
            }));

            // Store stops data indexed by vehicleId
            stopsByVehicle[vehicleId] = stopsData;
        }

        const currentDate = getCurrentDate();

        // Store the data in session
        app.locals.vehiclesH9 = vehicles;
        app.locals.stopsByVehicleH9 = stopsByVehicle;
        app.locals.currentDateH9 = currentDate;

        // Date functions
        function getCurrentDate() {
            const now = new Date();
            const year = now.getFullYear();
            const monthNames = ["Január", "Február", "Március", "Április", "Május", "Június",
                "Július", "Augusztus", "Szeptember", "Október", "November", "December"];
            const month = monthNames[now.getMonth()];
            const day = now.getDate().toString().padStart(2, '0');
            return `${day} ${month} ${year}`;
        }

    } catch (error) {
        console.error('Error fetching data:', error);
    }
}
// Function to fetch data from API and start interval
async function startFetchingDataH9() {
    // Fetch data immediately
    await fetchDataFromAPIH9();

    // Set interval to fetch data every 30 seconds
    setInterval(async () => {
        await fetchDataFromAPIH9();
    }, 30000); // 30 seconds in milliseconds
}

// Start fetching data
startFetchingDataH9();

// Routes
app.get('/home/vonatokH9', async (req, res) => {
    try {
        const vehiclesH9 = app.locals.vehiclesH9 || [];
        const stopsByVehicleH9 = app.locals.stopsByVehicleH9 || {};
        const selectedDirectionH9 = req.session.selectedDirectionH9 || '';

        res.render('vonatokH9', { vehiclesH9, stopsByVehicleH9, selectedDirectionH9 });
    } catch (error) {
        console.error('Error rendering page:', error);
        res.status(500).send('Error rendering page');
    }
});
app.post('/home/vonatokH9', async (req, res) => {
    try {
        req.session.selectedDirectionH9 = req.body.selectedDirectionH9;

        res.redirect('/home/vonatokH9');
    } catch (error) {
        console.error('Error processing filter:', error);
        res.status(500).send('Error processing filter');
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

const PORT = process.env.PORT || 3000; // Use environment port or default to 3000
var server = app.listen(PORT, () => {
    server.setTimeout(500000); // Set timeout to 500 seconds (500,000 milliseconds)
    console.log(`Server is running on port ${PORT}`);
});