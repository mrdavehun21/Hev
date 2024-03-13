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

//-------------------------------------------------------//

const VonatSchema = new mongoose.Schema({
    irany: {
        type: String,
        required: true
    },
    szerelveny: {
        type: [Number],
        required: true
    }
});

const VonalSchema = new mongoose.Schema({
    szam: {
        type: Number,
        required: true
    },
    vonatok: [VonatSchema]
});

const HevModel = mongoose.model('hevcollections', VonalSchema);


module.exports = {
    Hev: HevModel,  //index.js-ben lévő const megnevezés, ebben a fájlban lévő megnevezés
    Collection: Collection,
};