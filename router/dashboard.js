const router = require("express").Router();
const fetch = require('node-fetch');
const settings = require("../settings.json");
const CLIENT_ID = settings.discord.client_id
const CLIENT_SECRET = settings.discord.client_secret

module.exports.run = async (userdb) => {
    router.get("/dashboard", function (req, res) {
        if (!req.session.data || !req.session.data.userinfo) {
            return res.sendStatus(403)
        }
        res.render("dashboard")
    });
}

module.exports.router = router;