const express = require("express");
const session = require('express-session');
require('dotenv').config();
const app = express();
const axios = require('axios');
const fs = require('fs');
const rateLimit = require('express-rate-limit');
const path = require('path');
var polyUtil = require('polyline-encoded');

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
    return trip ? trip.tripHeadsign : tripId;
    //it works yay
}

// Helper function to get the current date in YYYYMMDD format
function getCurrentDate() {
    const now = new Date();
    const year = now.getFullYear();
    const month = (now.getMonth() + 1).toString().padStart(2, '0'); // Adding 1 to month as it is 0-indexed
    const day = now.getDate().toString().padStart(2, '0');
    return `${year}${month}${day}`;
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
            routeId: vehicle.routeId,
            tripHeadsign: matchTripIdToTripHeadsign(vehicle.tripId, vehiclesData.references.trips),
            stopName: matchStopIdToName(vehicle.stopId, vehiclesData.references.stops),
            location: {
                lat: vehicle.location.lat,
                lon: vehicle.location.lon
            }
        }));
        // const trips = vehiclesData.references.trips;
        // console.log('All trips:', trips);

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
                departureTime: formatTime(stop.departureTime),
            }));
        });

        var encoded1 = "us}`HisesB{A?_A@mA?o@?eA?{CAw@?yCCs@?_A?mAAg@?u@?_CI_ACmAC]AUCU?QAuAHG@[DUD]DYB[BO@M?O?O?MAGAS?OAMAg@Co@Ci@CMAK?K?I?M@M@I@I@K@GBsBb@kMxB??o@Jc@Jy@Le@@}@DI?E?U?W@W?W?YAY?[A[AYA[CYA[CYCYEYCYEYEYEYGWEWGWGWGWIWGo@SUIWIUIUGWIUIWIYIWGWIWGWIWGWGUGWIUGmAYSEQESEUEUGWGUECAYGYGYGWGYGYGWGYGWGWGYGqA_@UIUKUMUKUOUMWOYOWOYQYOYQiEwCUQWQUQk@c@UQUQSSUSUSUSUUUUWUUWWSkAkAUSUUCCOOUSSSUSSSSSSSSSQSSUQUQUSYSWUWUWUSUSUQWMUMWKWIWGWGYGYGYG]G[E[E[E]E]A[C]?]A]@Y?W?U@U@gDFY@U@W@W?Y@W@W?U@W@U?W@YBYB[BYB[B]B[D[B[B[BYB[@[@Y@Y@Y?Y?Y?Y?WAY?W?W?WAW?U?W?WAY?[?[AYA[C[CYE[EYGYIYGWKYIWIYKWIWKWIWIWIWGWEWEWCYAYAYAYAY?YAY?Y@W?Y@W?Y@WBW@WDUDWDWFWFUHWJWJULULWNSNQJUPQLSLQLSLQLUNOLSLGDMHUPWNWPWPWPWPWPWPWRYPWPYPYPYLYLYJmA^YBYDY@g@@s@?SAQAYEWCSEQEQESEUIUIQISKSKUMWMGEMIWOYOWMWMWMUKWKUIWIUGWIWGYIYIYIYIYIYGYIYIWGWIWGWIWGWGUIYGWIYIYGWIWIWGWGWIUGWGUGUIWGWGWIYIYGYIYIYIYIWGYIWIYGWIWGWIWGWGUIWGWIYGYIYIYIYIWGYIYGWIYEYGWEYC_AI[As@?W@S@S?YBSBUBSBK@E@SDUDQDSFUFWHWHYHYH[HYFYFYD[DYBYDWDYDYDWBYDWDWBWDcALs@BY?Y?YCYAYEYEWEWCYEWEWEWEWE[CYC[CYC[CYCYAYCYCYCYCYCYCWAWCUCSASASCQAUCUASCQAWCIAOAQAUCWAWCYC[CYCYCYCYCYCYCWAWAW?W?W@WBYBYD[FYFYHWJYLWLWNWNWPURUPWRUPWRWTWRWTWRWRWRWTWRURWRUPWRURUPURUPURUPUPSPUPSPUPSPSPSNSPSNSNSNSNSLSJi@TUHUFUFWBUDU@W@U?U?UCSCSEUEQGSIQISKQKOMQKQMQKSOUOUOWQYQWQIEOKWQYSWQWQYQWQYQWQWQWQYQWQWQWOUQWQWOUQUOWOUOUQUOSOUMUOSOUOSMSMSOUOUOWQWQUSUSUUSWSWQWQ[QYOYQYQWQWQUQSQSSQSOQOSOUMSQWOUQWQWQWQWQWQWQUQWOUQWQUOUOUQQKSOOKOKQKOMQMWQSMSOUOWQUOUQWQUOUQUQUQUQUQSQUOUQSOUMUOSOUMSOUMSOSMCAOKSMSMSMSOa@WUOWQWQYQWOYQWQWQWOWQUOWQUOWOUOUOWOSOUOUOUMSOUOUOUOWOWQYQWQYQWOWOWMWKWKWIWGWEYEWEYC[C[C[C]C[E[C[C[Ck@E[C[E[C]C[Ck@G{@G]CuAMYC[CYCYCYCYCYCYCYCYAYAYAW?Y?Y?W@YBW@YDWBYFWDWFc@JWHUHWJUJWJUJUJWJUJWJULUJUJUJUJUJUHUJSJUHIDg@R]L]LYHwAf@y@VA@y@VYJ{@Xq@Tc@POHSJIDIFIDGDC@CBCBC@CBEDKJMLYTIJgCjC]\\y@z@QRIJKJSXUXORQVi@`AOTi@bAo@jAm@fAa@t@m@hAg@|@m@hAKNOZSZQZQZSZQXQZSZQZQZQZQXQZOXOXOXOVOXOVOXMVOVOVMVOVOVOTOVOTQVQVUVEFMNUVUTUTWTURc@ZWPWPYNWLYNYJYLYJYH[H[HYF[H[Hg@JYHYFYFYFYFYHWFYFYFWFYHWFYFWFYHWHWHWJWHWJWJWHWJWJWHUJWJUHWHUJUHUHUJMDGBUHUHUJWHWJYJYJYJYLWJWHWJWHUJUHWJWHWJWJYJWJYJWJYJWJYJYJYJYJWJYJa@PWHUHWJWJWHWJWJWJYJWJYJYJWJYJYJYJYJYJWJYLYJYJYJYJWJYJYJWLYLe@RWNWNYNWNYLYPYNWNWNWLWLa@TWNWLWNWNWNYNc@Ve@VWNWNULUPUPUPURUTUTSVUVmAhBOXQXMZOVMXMVMXMVMXOXMXMXMVMXMVKVMTS`@KTKTKRKRQ^O\\OZOZKTKTKTGLCFKTKRKTIROXITMTMXOZOXQX[`@SRUPWPULe@NYHWH[Fg@HY@[?[CWEa@KUIUMUOSQSSSSQWMUMWKWK[KYI]I_@Gc@Ge@Cg@Ag@Ag@@i@Bi@Bg@Dk@Fg@Be@Dg@De@De@De@De@Fy@Bg@Bg@@e@@i@?g@?g@?e@Ag@Ae@Ag@Ce@Ce@G{@Ge@Gg@Ge@Mw@Ga@Ic@Mq@Ia@I_@Ga@Ic@Ia@Ow@Ic@Ke@Ie@Ke@Ig@Ou@Ic@Ic@Ic@Ic@Ic@Ic@Ow@Ic@Ic@Kc@Mu@Ic@Ic@Ic@Os@Ic@Ia@Ic@Ic@Ia@Ic@Ic@Ia@Gc@Ia@Mu@Gc@Gc@Gc@Ec@Iw@Ee@Ec@Ce@Ce@Ce@Ag@Ae@Ag@A}@?i@?g@?i@@i@@}@?i@@y@?e@@e@?e@@w@@e@?c@@e@?w@@c@?e@@w@@c@?e@@u@?c@@e@?c@@c@@u@?c@?a@@c@?a@@u@?g@@e@?i@?g@Ag@?i@C{@Ci@Ag@Ci@Ei@Eg@Ei@I}@Gi@Ky@Ie@Ga@Ia@G_@I_@I_@I]Om@K_@K]K]M]Sk@M]M[M]O[g@cAOYOYQWWc@QWQUYa@QUQUSUQUQS]a@KMEGQUSUQUSUQUQS[a@QSQU[_@QSQSOUQSY]QSY]QSOSQU[_@SUSWSWUYSWUWSWUW]e@UWSUSWSWUW]c@SUSWSW[a@SUSW[_@SUQU[_@QUOSY]OQOSOQOQMOSUCEo@w@OSg@m@IKMOIMIKIMc@q@_DwEm@}@Wa@qBwC}A_C"
        var encoded2 = "_yeaHircsBdA@P?F?H?`@@h@AX?PARAb@Cn@KVGtCe@nAU|@STEDAdBUvAU|Bc@@JAKHAB?f@IXGvAU~B_@jASn@M@?f@Od@Mn@SPGjA_@@LAMBABAHCPENG^Ml@Sv@Wf@OzAg@ZKRIJEBAb@Sl@]\\Sn@]j@]j@[h@[b@YrA}@|@k@@HAIDAFEHGPMFC`As@bCiB|AiA|@q@HGrAcAf@c@DCNQFIX_@n@y@h@s@T[`@k@@?DJEKDGVUZUBCNIPIrAc@`Bi@VItAc@^Ih@IpBKfC^nC^f@Hb@D?H?I@@@?L@H@H@r@LrBVrGv@F@xBVRBH@T@lA?B??B?CH?|GEhA?F?~@Aj@?L@H?J@P@j@Ff@HPBfARHB?@?APBNBv@LnAPlARz@N^BZ@tA@h@?P?J?VENCNELEFCLE`Ai@LG?F?GPIj@WLI@?rAWpBWZEDCDADCDE@ABE@EBGBKBSAQ?IMaBAM?I?Q?M?EPqBJDKEBQ@I@K?A@C?E@CBE@GBCDGBEDEDC@?BCB?BAB?B?t@AB?FAJCFE^SFCHCF?DAH?D@R?j@DL@F@F@NDB?HBF@F@D@jALhALbAD`AFB??H?IL@D?xBDtC@H?D?rDB`DCtCGH?dIAfAGF??J?K~@C\\CfAE@?ZAdF]TApDa@z@K?F?GFA`@GZE|AW`Ca@xCo@pA[f@Oh@OLEHCFCFCFCBADAFAD?B@@@B@DBBDDDBJBHDNBHBFBB@@DBFBH@F?F?HEDCDEBGBE@EBE@G@I@M?M@U@K@KBKDIDGFGDCFEFCZOFCz@]HEBHCIBAlAg@rCsA@A@AtCsArAm@bAs@f@_@hDeCJI~@s@HGDLEMDCFE~BgBbAw@fCmBNKFEVQ^SLILIJIFINSP[PUb@e@\\c@LM|@gABCDHCGHIbFwFLONQPMNKRKRMHEFGHGFIHKn@mABGJONQvDcEzCgDtA_BHKHILMPKLGn@YHEFEFEFGFELONSbAyABEBCBCFCJED?H?H@FDHDx@|@DDDBFD@@AD@EBBPHDBB@LF^JxA`@j@PJBXHLDB@XHRDrA`@XJZLTJVL\\RDBl@\\RJVPf@\\B@AD@EFFDBPNHHl@l@PRFJHLFJHNhBrDJPHRHTL^`@tAh@fBFRDLJ^BFZrADLBFBDBDFFHDF@L@@?`@BjBN?B?C@?`@DB?\\D\\DTFTDHBrA\\bCl@PDJBf@L`@J?A?@F@\\JPDRHJBD@PDRF^HfAX`@JNBLBLBL@h@L~ElAPFB?hBb@bAXb@JRD|@VPDHB?@?ALBbDx@v@TbAVpD~@FB?B?CB?VHVF~@T~Bl@`Bb@pD~@fAXdAXfAXRHRHNDND~Bj@D@@EADHBF@D@FBJBF@PD\\Hp@P~@Tz@Rr@Pz@Tr@Rx@RhCp@H@VHXH?@?AD@JBVFNDB@|A`@jBd@xIzB?F?GJDZHVFzKrChBd@JDXFdAXdBd@AL@MF@DBLFJFPLDDHDHDHBJDHBdBZPBLBVD~ALxBR|AL`E^B?NBZBjAJD?AJ@KzD^jBPF?P@dK~@H@VBjAJD@AH@IxGl@jBPPBB??F?GVBL@PBnAL^BZBH@lADjADZ@X?NAPANCFAFANERGPG\\Oz@_@@Ah@U|DeBf@STGTAN@NBLDNHLLPPnB|BZh@DLDLDTDZBX?BA?@?@V?ZAVAREVEXK\\IRORMPQP_@T[NYP]XUPQRQTU^c@x@c@`AoDlIWp@Od@CFKb@Ol@AH?A?@Mt@Ib@Eb@IfASxCMfAMfAQbASdAU~@Wz@Sl@Uj@wH|QAA@@?@GNQb@Sh@YbAWz@WdASfAQhAUzA[fCeAlIFBGCAB_Ex[Ir@K`AIhAAJ?B????AJ?LC\\CdAAb@Ab@?t@?L@pC?lAAVEdBIxAGr@Ix@It@Kt@Kr@uBfLA?@?CFQ`ASfAYfBSzAMdAIx@MvAGhAEdAEtACxA?lB@tA@xA?????D?F@pB@lAAnA?vAOjUItLArA?DA?@??@?`BBfBFnBJ|ALhBJdALdAPjAXdBXpAC@BA??H\\FZJ`@HZLd@\\jAZfAFRHTJTHRHNHLHLHJNRLLVV`@\\bAz@bDrCZZHHHHFJLPJTFLLZDNXv@BLDNDRDRDT?@BT@RBZFtA@NBn@@\\DbAB\\FtA??A@"
        var latlngs = polyUtil.decode(encoded1);
        var latlngs2 = polyUtil.decode(encoded2);

        app.locals.vehiclesH5 = vehicles;
        app.locals.latlngs = latlngs;
        app.locals.latlngs2 = latlngs2;
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

//----------------------Villamosok-------------------------------------------//

//--------------17,19,41------------------//
//const routeIds = ['BKK_3410', 'BKK_3190', 'BKK_3170'];
// Function to fetch data from API
async function fetchDataFromAPIVillamos(routeIds) {
    try {
        const apiKey = process.env.API_KEY;
        const allVehicles = [];
        const allStopsByVehicle = {};

        for (const routeId of routeIds) {
            const vehiclesResponse = await axios.get('https://futar.bkk.hu/api/query/v1/ws/otp/api/where/vehicles-for-route', {
                params: {
                    routeId: routeId,
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
                routeId: vehicle.routeId,
                tripHeadsign: matchTripIdToTripHeadsign(vehicle.tripId, vehiclesData.references.trips),
                stopName: matchStopIdToName(vehicle.stopId, vehiclesData.references.stops),
                location: {
                    lat: vehicle.location.lat,
                    lon: vehicle.location.lon
                }
            }));

            allVehicles.push(...vehicles);

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
                allStopsByVehicle[vehicles[i].vehicleId] = stopResponse.data.data.entry.stopTimes.map(stop => ({
                    stopId: matchStopIdToName(stop.stopId, stopResponse.data.data.references.stops),
                    stopSequence: stop.stopSequence,
                    predictedArrivalTime: formatTime(stop.predictedArrivalTime),
                    predictedDepartureTime: formatTime(stop.predictedDepartureTime),
                    arrivalTime: formatTime(stop.arrivalTime),
                    departureTime: formatTime(stop.departureTime)
                }));
            });
        }

        app.locals.vehiclesVill = allVehicles;
        app.locals.stopsByVehicleVill = allStopsByVehicle;
        app.locals.currentDateVill = getCurrentDate();
    } catch (error) {
        console.error('Error fetching data:', error);
    }
}

async function startFetchingDataVillamos() {
    const routeIds = [ 'BKK_3190', 'BKK_3020', 'BKK_3171'];
    await fetchDataFromAPIVillamos(routeIds);
    setInterval(() => fetchDataFromAPIVillamos(routeIds), 30000);
}

// Start fetching data
startFetchingDataVillamos();

// Routes
app.get('/home/villamos', (req, res) => {
    try {
        const vehiclesVill = app.locals.vehiclesVill || [];
        const stopsByVehicleVill = app.locals.stopsByVehicleVill || {};
        // const selectedDirectionVill = req.session.selectedDirectionVill || '';
        // , selectedDirectionVill
        res.render('villamos', { vehiclesVill, stopsByVehicleVill });
    } catch (error) {
        console.error('Error rendering page:', error);
        res.status(500).sendFile(path.join(__dirname, 'public', '500.html'));
    }
});

app.post('/home/villamos', (req, res) => {
    try {
        req.session.selectedDirectionVill = req.body.selectedDirectionVill;
        res.redirect('/home/Villamos');
    } catch (error) {
        console.error('Error processing filter:', error);
        res.status(500).sendFile(path.join(__dirname, 'public', '500.html'));
    }
});

//----------------------Villamosok_END-------------------------------------------//
app.get("/home/map", (req, res) => {
    const vehiclesH5 = app.locals.vehiclesH5 || [];
    const latlngs = app.locals.latlngs || [];
    const latlngs2 = app.locals.latlngs2 || [];
    const vehiclesVill = app.locals.vehiclesVill || [];
    const licensePlatesData = JSON.parse(fs.readFileSync('./data/licensePlates.json', 'utf8'));

    if (req.xhr) {
        // If the request is an AJAX request, respond with JSON data
        res.json({ H5: vehiclesH5, tram: vehiclesVill, latlngs: latlngs, latlngs2: latlngs2, licensePlates: licensePlatesData});
    } else {
        // Otherwise, render the EJS template
        res.render('map', { H5: vehiclesH5, tram: vehiclesVill, latlngs: latlngs, latlngs2: latlngs2, licensePlates: licensePlatesData});
    }
});

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