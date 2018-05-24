// Dependencies
var express = require("express");
var exphbs = require("express-handlebars");
var bodyParser = require("body-parser");
var logger = require("morgan");
var mongoose = require("mongoose");
var path = require("path");

// Scraping tools
var request = require("request");
var cheerio = require("cheerio");

// Models
var Note = require("./models/Note.js");
var Article = require("./models/Article.js");

//Define port
var port = process.env.PORT || 3000

// Initialize Express
var app = express();

// Use public as static dirtory
app.use(express.static("public"));

//Set Handlebars Views Engine 
app.engine("handlebars", exphbs({
    defaultLayout: "main",
    partialsDir: path.join(__dirname, "/views/layouts/partials")
}));
app.set("view engine", "handlebars");

// Use morgan logger and body parser
app.use(logger("dev"));
app.use(bodyParser.urlencoded({
  extended: false
}));

// Database configuration with mongoose
mongoose.connect("mongodb://heroku_jmv816f9:5j1nd4taq42hi29bfm5hobeujd@ds133192.mlab.com:33192/heroku_jmv816f9");
//mongoose.connect("mongodb://localhost/mongoscraper");
var db = mongoose.connection;

// If deployed, use the deployed database. Otherwise use the local mongoHeadlines database
var MONGODB_URI = process.env.MONGODB_URI || "mongodb://localhost/mongoHeadlines";

// Set mongoose to leverage built in JavaScript ES6 Promises
// Connect to the Mongo DB
mongoose.Promise = Promise;
mongoose.connect(MONGODB_URI);

// When mongodb is ON console log any mongoose errors
db.on("error", function(error) {
  console.log("Mongoose Error: ", error);
});

// ONCE logged in to mongodb through mongoose, log a success message
db.once("open", function() {
  console.log("Mongoose connection is successful.");
});

// ROUTES

//GET requests to render Handlebars pages
app.get("/", function(req, res) {
  Article.find({"saved": false}, function(error, data) {
    var hbsObject = {
      article: data
    };
    console.log(hbsObject);
    res.render("home", hbsObject);
  });
});

app.get("/saved", function(req, res) {
  Article.find({"saved": true}).populate("notes").exec(function(error, articles) {
    var hbsObject = {
      article: articles
    };
    res.render("saved", hbsObject);
  });
});

//GET request to scrape from nytimes
app.get("/scrape", function(req, res) {
  request("https://www.nytimes.com/", function(error, response, html) {
    // Load cheerio and save it to $ for a shorthand selector
    var $ = cheerio.load(html);
    $("article").each(function(i, element) {

      //Empty result object
      var result = {};

      //Populate Result Title, Summary, Link
      result.title = $(this).children("h2").text();
      result.summary = $(this).children(".summary").text();
      result.link = $(this).children("h2").children("a").attr("href");

      // Use Article model, create a new entry
      // This effectively passes the result object to the entry (and the title and link)
      var entry = new Article(result);

      // Save Entry to the doc in db
      entry.save(function(err, doc) {
        // console log errors
        if (err) {
          console.log(err);
        }
        // console log documented
        else {
          console.log(doc);
        }
      });

    });
      //console log that scrape completed 
        res.send("Scrape Completed");

  });

});

// GET every articles scraped from the mongoDB
app.get("/articles", function(req, res) {
  // FIND every doc in the Articles Collection
  Article.find({}, function(error, doc) {
    // Console Log errors
    if (error) {
      console.log(error);
    }
    // Respond the doc to the browser as a json object
    else {
      res.json(doc);
    }
  });
});

// GET Articles by Id
app.get("/articles/:id", function(req, res) {
  // FindOne Specific Id in Article 
  Article.findOne({ "_id": req.params.id })
  //Populate all notes associated
  .populate("note")
  //Execute Query
  .exec(function(error, doc) {
    // Console Log errors
    if (error) {
      console.log(error);
    }
    //Respond the doc to the browser as a json object
    else {
      res.json(doc);
    }
  });
});


//POST request to SAVE ARTICLE with objectid
app.post("/articles/save/:id", function(req, res) {
      // findone article id and update with saved boolean as true
      Article.findOneAndUpdate({ "_id": req.params.id }, { "saved": true})
      // Execute query
      .exec(function(err, doc) {
        //Console Log errors
        if (err) {
          console.log(err);
        }
        else {
          // Respond to the browser and send the document
          res.send(doc);
        }
      });
});

// POST request to DELETE ARTICLE with objectid
app.post("/articles/delete/:id", function(req, res) {
      // findone article id and update with saved boolean as false
      Article.findOneAndUpdate({ "_id": req.params.id }, {"saved": false, "notes": []})
      // Execute query
      .exec(function(err, doc) {
        // Console Log errors
        if (err) {
          console.log(err);
        }
        else {
          // Respond to the browser and send the document
          res.send(doc);
        }
      });
});


// Create a new note
app.post("/notes/save/:id", function(req, res) {
  // Create a new note and pass the req.body to the entry
  var newNote = new Note({
    body: req.body.text,
    article: req.params.id
  });
  console.log(req.body)
  // And save the new note the db
  newNote.save(function(error, note) {
    // Log any errors
    if (error) {
      console.log(error);
    }
    // Otherwise
    else {
      // Use the article id to find and update it's notes
      Article.findOneAndUpdate({ "_id": req.params.id }, {$push: { "notes": note } })
      // Execute the above query
      .exec(function(err) {
        // Log any errors
        if (err) {
          console.log(err);
          res.send(err);
        }
        else {
          // Or send the note to the browser
          res.send(note);
        }
      });
    }
  });
});

// Delete a note in an article by finding one and remove
app.delete("/notes/delete/:note_id/:article_id", function(req, res) {
  // findone note and remove note id
  Note.findOneAndRemove({ "_id": req.params.note_id }, function(err) {
    // Console Log errors
    if (err) {
      console.log(err);
      res.send(err);
    }
    else {
      Article.findOneAndUpdate({ "_id": req.params.article_id }, {$pull: {"notes": req.params.note_id}})
       // Execute query
        .exec(function(err) {
          // console log errors
          if (err) {
            console.log(err);
            res.send(err);
          }
          else {
            //Respond by sending  note to the browser
            res.send("Note Deleted");
          }
        });
    }
  });
});

// Listen port and console log it
app.listen(port, function() {
  console.log("App running on port " + port);
});

