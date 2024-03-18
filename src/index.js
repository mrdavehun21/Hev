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
        const response = await axios.get('https://futar.bkk.hu/api/query/v1/ws/otp/api/where/vehicles-for-route', {
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
        const responseData = response.data;

        // Extracting license plate section and matching tripId to tripHeadsign
        const vehicles = responseData.data.list.map((vehicle, index) => ({
            index: index + 1, // Adding 1 to start index from 1
            licensePlate: vehicle.licensePlate,
            tripHeadsign: matchTripIdToTripHeadsign(vehicle.tripId, responseData.data.references.trips),
            stopName: matchStopIdToName(vehicle.stopId, responseData.data.references.stops)
        }));

        // Render the EJS file with the data
        res.render('vonatok', { vehicles });
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
