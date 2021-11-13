const router = require("express").Router();
const fetch = require('node-fetch');
const settings = require("../settings.json");
const CLIENT_ID = settings.discord.client_id
const CLIENT_SECRET = settings.discord.client_secret

module.exports.run = async (userdb) => {
  router.get("/login", async (req, res) => {
    res.redirect("https://discord.com/api/oauth2/authorize?client_id=886274617994535013&redirect_uri=http%3A%2F%2Flocalhost%3A3000%2Fcallback&response_type=code&scope=identify%20email%20guilds%20guilds.join")
  });

  router.get("/logout", async (req, res) => {
    req.session.destroy()
    res.redirect("/")
  });

  router.get("/callback", async (req, res) => {
    if (!req.query.code) return res.send("No code was provided!")
    let json = await fetch(
      'https://discord.com/api/oauth2/token',
      {
        method: 'post',
        body: "client_id=" + CLIENT_ID + "&client_secret=" + CLIENT_SECRET + "&grant_type=authorization_code&code=" + encodeURIComponent(req.query.code) + "&redirect_uri=" + encodeURIComponent(settings.discord.oauth2.link + settings.discord.oauth2.callbackpath),
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
      }
    );

    if (!json.ok) return res.send("/")
    let codeinfo = JSON.parse(await json.text());

    let scopes = codeinfo.scope;

    let missingscopes = [];

    if (scopes.replace(/identify/g, "") == scopes) missingscopes.push("identify");
    if (scopes.replace(/email/g, "") == scopes) missingscopes.push("email");
    //if (newsettings.api.client.bot.joinguild.enabled == true) if (scopes.replace(/guilds.join/g, "") == scopes) missingscopes.push("guilds.join");
    if (missingscopes.length !== 0) return res.send("ERROR MISSINGSCOPES Scopes: " + missingscopes.join("%20"));
    let userinfo_raw = await fetch(
      'https://discord.com/api/users/@me',
      {
        method: "get",
        headers: {
          "Authorization": `Bearer ${codeinfo.access_token}`
        }
      }
    );
    let userinfo = JSON.parse(await userinfo_raw.text());
    let guildinfo_raw = await fetch(
      'https://discord.com/api/users/@me/guilds',
      {
        method: "get",
        headers: {
          "Authorization": `Bearer ${codeinfo.access_token}`
        }
      }
    );
    let guilds = await guildinfo_raw.json();
    console.log(guilds)
    if (!Array.isArray(guilds)) {
      console.log("broki")
      return res.sendStatus(500)
    }

    if (!userinfo.verified) {
      res.set('Content-Type', 'text/html');
      return res.send(Buffer.from('<!DOCTYPE html> <html> <head> <meta name="viewport" content="width=device-width" /> <meta charSet="utf-8" /> <title>Banned</title> </head> <body> <div id="__next"> <div style="color:#000;background:#fff;font-family:-apple-system, BlinkMacSystemFont, Roboto, &quot;Segoe UI&quot;, &quot;Fira Sans&quot;, Avenir, &quot;Helvetica Neue&quot;, &quot;Lucida Grande&quot;, sans-serif;height:100vh;text-align:center;display:flex;flex-direction:column;align-items:center;justify-content:center"> <div> <style> body { margin: 0 } </style> <h1 style="display:inline-block;border-right:1px solid rgba(0, 0, 0,.3);margin:0;margin-right:20px;padding:10px 23px 10px 0;font-size:24px;font-weight:500;vertical-align:top"> Not Verified</h1> <div style="display:inline-block;text-align:left;line-height:49px;height:49px;vertical-align:middle"> <h2 style="font-size:14px;font-weight:normal;line-height:inherit;margin:0;padding:0">Your discord user account is not verified. Please verify it and try again.</h2> </div> </div> </div> </div> </body> </html>'));
    }

    userinfo.access_token = codeinfo.access_token;
    userinfo.guilds = guilds;

    let check_if_banned = (await fetch(
      `https://discord.com/api/guilds/${settings.discord.guildID}/bans/${userinfo.id}`,
      {
        method: "get",
        headers: {
          'Content-Type': 'application/json',
          "Authorization": `Bot ${settings.discord.bot.token}`
        }
      }
    )).status;

    if (check_if_banned == 200) {
      await process.db.toggleBlacklist(userinfo.id, true);
      res.set('Content-Type', 'text/html');
      return res.send(Buffer.from('<!DOCTYPE html> <html> <head> <meta name="viewport" content="width=device-width" /> <meta charSet="utf-8" /> <title>Banned</title> </head> <body> <div id="__next"> <div style="color:#000;background:#fff;font-family:-apple-system, BlinkMacSystemFont, Roboto, &quot;Segoe UI&quot;, &quot;Fira Sans&quot;, Avenir, &quot;Helvetica Neue&quot;, &quot;Lucida Grande&quot;, sans-serif;height:100vh;text-align:center;display:flex;flex-direction:column;align-items:center;justify-content:center"> <div> <style> body { margin: 0 } </style> <h1 style="display:inline-block;border-right:1px solid rgba(0, 0, 0,.3);margin:0;margin-right:20px;padding:10px 23px 10px 0;font-size:24px;font-weight:500;vertical-align:top"> Banned</h1> <div style="display:inline-block;text-align:left;line-height:49px;height:49px;vertical-align:middle"> <h2 style="font-size:14px;font-weight:normal;line-height:inherit;margin:0;padding:0">You are banned from the hosts discord and cannot use this dashboard.</h2> </div> </div> </div> </div> </body> </html>'));
    } else if (check_if_banned == 404) {
      await fetch(
        `https://discord.com/api/guilds/${settings.discord.guildID}/members/${userinfo.id}`,
        {
          method: "put",
          headers: {
            'Content-Type': 'application/json',
            "Authorization": `Bot ${settings.discord.bot.token}`
          },
          body: JSON.stringify({
            access_token: codeinfo.access_token
          })
        }
      );
    } else {
      console.log(chalk.red("[ERROR] The status code contacting discord was " + check_if_banned + ", instead of 200 or 404. This means that your machine has some serious internet issues."));
    }

    if (userinfo.verified == true) {

      let ip = (settings.ip["trust x-forwarded-for"] == true ? (req.headers['x-forwarded-for'] || req.connection.remoteAddress) : req.connection.remoteAddress);
      ip = (ip ? ip : "::1").replace(/::1/g, "::ffff:127.0.0.1").replace(/^.*:/, '');

      if (settings.ip.block.includes(ip)) return res.send("ERROR IP BLOCKED")

      let dbinfo = await process.db.fetchAccountDiscordID(userinfo.id);

      if (!dbinfo) {
        panelinfo = await process.db.createOrFindAccount(userinfo.id, userinfo.email, userinfo.username, `#${userinfo.discriminator}`);

        if (!panelinfo) return res.redirect("/")

        if (panelinfo.password) generated_password = panelinfo.password;

        dbinfo = {
          discord_id: userinfo.id,
          pterodactyl_id: panelinfo.id,
          coins: 0,
          package: null,
          memory: null,
          disk: null,
          cpu: null,
          servers: null
        };

        await process.db.checkJ4R(userinfo.id, guilds);
      }

      const panel_id = dbinfo.pterodactyl_id;

      let panelinfo_raw = await fetch(
        `${settings.pterodactyl.domain}/api/application/users/${panel_id}?include=servers`,
        {
          method: "get",
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${settings.pterodactyl.apikey}` }
        }
      );

      if (await panelinfo_raw.statusText == "Not Found") return res.redirect("/")

      let blacklist_status = await process.db.blacklistStatus(userinfo.id);
      if (blacklist_status && !panelinfo.root_admin) {
        res.set('Content-Type', 'text/html');
        return res.send(Buffer.from('<!DOCTYPE html> <html> <head> <meta name="viewport" content="width=device-width" /> <meta charSet="utf-8" /> <title>Blacklisted</title> </head> <body> <div id="__next"> <div style="color:#000;background:#fff;font-family:-apple-system, BlinkMacSystemFont, Roboto, &quot;Segoe UI&quot;, &quot;Fira Sans&quot;, Avenir, &quot;Helvetica Neue&quot;, &quot;Lucida Grande&quot;, sans-serif;height:100vh;text-align:center;display:flex;flex-direction:column;align-items:center;justify-content:center"> <div> <style> body { margin: 0 } </style> <h1 style="display:inline-block;border-right:1px solid rgba(0, 0, 0,.3);margin:0;margin-right:20px;padding:10px 23px 10px 0;font-size:24px;font-weight:500;vertical-align:top"> Blacklisted</h1> <div style="display:inline-block;text-align:left;line-height:49px;height:49px;vertical-align:middle"> <h2 style="font-size:14px;font-weight:normal;line-height:inherit;margin:0;padding:0">You have been blacklisted from this dashboard.</h2> </div> </div> </div> </div> </body> </html>'));
      }

      req.session.data = {
        dbinfo: dbinfo,
        userinfo: userinfo,
        panelinfo: panelinfo
      };

      if (generated_password) req.session.variables = {
        password: generated_password
      };

      if (!generated_password) suspendCheck(req.session.data.userinfo.id, panelinfo.root_admin);

      res.redirect(`/dashboard`);
    }
  });
}
module.exports.router = router;
