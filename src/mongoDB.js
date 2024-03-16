const mongoose = require("mongoose");

mongoose.connect("mongodb+srv://mrdavehun:123@palyaszamok.92qbrfa.mongodb.net/")
.then(() => {
    console.log("mongodb connected");
})
.catch((e) => {
    console.log(e);
});

const LogInSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true
    },
    password: {
        type: String,
        required: true
    }
});

const Collection = new mongoose.model("loginCollection", LogInSchema);

module.exports = Collection;
//index.js-ben lévő const megnevezés, ebben a fájlban lévő megnevezése
