const express = require("express");
const app = express();
const path = require("path");
const hbs = require("hbs");
const collection = require("./mongodb");
const templatePath = path.join(__dirname, '../templates');

app.use(express.json());
app.set("view engine", "hbs");
app.set("views", templatePath);
app.use(express.urlencoded({extended: false}));

app.get("/", (req, res) => {
    res.render("login"); // Render the login page
});
app.get("/signup", (req, res) => {
    res.render("signup"); // Render the signup page
});

app.post("/signup", async (req, res) => {
    const data = {
        name: req.body.name,
        password: req.body.password
    };

    try {
        await collection.create(data);
        console.log("User created successfully:", data);
        // Redirect to some other page after signup, for example:
        res.render("home"); // You need to define "home" view
    } catch (error) {
        console.error("Error creating user:", error);
        // Handle error
        res.status(500).send("Error creating user");
    }
});

app.post("/login", async (req, res) => {

    try{
        const check=await collection.findOne({name:req.body.name})

        if(check.password===req.body.password){
            res.render("home")
        }
        else{
            res.send("Wrong password!")
        }
    }
    catch{
        res.send("Wrong details!")
    }
});

app.listen(443, () => {
    console.log("port connected");
});

