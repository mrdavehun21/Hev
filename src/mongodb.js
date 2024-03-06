const mongoose=require("mongoose")

mongoose.connect("mongodb+srv://mrdavehun:123@palyaszamok.92qbrfa.mongodb.net/")
.then(()=>{
    console.log("mongodb connected");
})
.catch((e)=>{
    console.log(e);
})

const LogInSchema=new mongoose.Schema({
    name:{
        type:String,
        required:true
    },
    password:{
        type:String,
        required:true
    }
})

const collection=new mongoose.model("Collection1",LogInSchema);

module.exports = collection;