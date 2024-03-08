const express = require("express");
const app = express();
//const path = require("path");
const collection = require("./mongodb");
//const templatePath = path.join(__dirname, '../views');

app.use(express.json());
app.set("view engine", "hbs");
//app.set("views", templatePath);
app.use(express.urlencoded({ extended: false }));
app.use(express.static('public'));

app.get("", (req, res) => {
    res.render("welcome"); // Render the login page
});

app.get("/login", (req, res) => {
    res.render("login"); // Render the login page
});

app.get("/signup", (req, res) => {
    res.render("signup"); // Render the signup page
});

app.get("/home", (req, res) => {
    res.render("home"); // Render the home page
});


app.post("/signup", async (req, res) => {
    const data = {
        name: req.body.name,
        password: req.body.password
    };

    try {
        await collection.create(data);
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
        const check = await collection.findOne({ name: req.body.name });

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
