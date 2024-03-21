const express = require("express");
const Collection = require("./mongoDB");
const app = express();
const axios = require('axios');

app.use(express.json());
app.set("view engine", "ejs");
app.use(express.urlencoded({ extended: false }));
app.use(express.static('public'));

app.get("", (req, res) => {
    res.render("welcome");
});

app.get("/login", (req, res) => {
    res.render("login");
});

app.get("/signup", (req, res) => {
    res.render("signup");
});

app.get("/home", (req, res) => {
    res.render("home");
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
                key: 'a619b5d8-6d54-451d-b612-47d0185abeb8'
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
            tripHeadsign: matchTripIdToTripHeadsign(vehicle.tripId, vehiclesData.data.references.trips),
            stopName: matchStopIdToName(vehicle.stopId, vehiclesData.data.references.stops)
        }));

        const vehicleIds = [];
        vehicles.forEach(vehicle => {
            vehicleIds.push(vehicle.vehicleId);
        });

        const stopPromises = [];

        // Iterate over each vehicleId and make a request
        for (const vehicleId of vehicleIds) {
            const stopPromise = axios.get('https://futar.bkk.hu/api/query/v1/ws/otp/api/where/trip-details', {
                params: {
                    vehicleId: vehicleId,
                    date: '20240321',
                    ifModifiedSince: 1625685137,
                    appVersion: '1.1.abc',
                    version: 4,
                    includeReferences: true,
                    key: 'a619b5d8-6d54-451d-b612-47d0185abeb8'
                }
            });

            stopPromises.push(stopPromise);
        }

        // Wait for all requests to complete
        const stopResponses = await Promise.all(stopPromises);

        // Process each stop response
        const stops = [];
        for (const response of stopResponses) {

            const stopTimesData = response.data;
            
            const stopsData = stopTimesData.data.entry.stopTimes.map(stop => ({
                stopName: matchStopIdToName(stop.stopId, stopTimesData.data.references.stops),
                stopHeadsign: stop.stopHeadsign,
                arrivalTime: new Date(stop.arrivalTime * 1000).toLocaleTimeString('hu-HU', { hour: '2-digit', minute: '2-digit', hour12: false })
            }));
            stops.push(...stopsData);
        }

        

        /*
        No stopName for every stop        
        Selectable stops and displaying departures and arrivals
        */
        //console.log(stopsData.data.references.stops);
        /*
        stops.forEach(stop => {
            console.log(stop.tripId);
        });
        */
        // Render the EJS file with the data
        res.render('vonatok', { vehicles, stops });
        } catch (error) {
        console.error('Error fetching data:', error);
        res.status(500).send('Error fetching data');
    }
});
//-------------------------------------------------------------//

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

app.post("/login", async (req, res) => {
    try {
        const check = await Collection.findOne({ name: req.body.name });

        if (check && check.password === req.body.password && req.headers.referer.includes('/login')) {
            res.redirect("/home");
        } else {
            res.send("Wrong username or password!");
        }
    } catch (error) {
        console.error("Error during login:", error);
        res.status(500).send("Error during login");
    }
});

const PORT = process.env.PORT || 3000; // Use environment port or default to 3000
var server = app.listen(PORT, () => {
    server.setTimeout(500000); // Set timeout to 500 seconds (500,000 milliseconds)
    console.log(`Server is running on port ${PORT}`);
});
