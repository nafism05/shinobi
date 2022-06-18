var fs = require('fs');
module.exports = function(s,config,lang){
    //Authenticator functions
    s.api = {}
    s.superUsersApi = {}
    s.factorAuth = {}
    s.failedLoginAttempts = {}
    //auth handler
    //params = parameters
    //cb = callback
    //res = response, only needed for express (http server)
    //request = request, only needed for express (http server)
    s.auth = function(params,cb,res,req){
        if(req){
            //express (http server) use of auth function
            params.ip=req.headers['cf-connecting-ip'] || req.headers['x-forwarded-for'] || req.connection.remoteAddress;
            var failed=function(){
                if(!req.ret){req.ret={ok:false}}
                req.ret.msg=lang['Not Authorized'];
                res.end(s.s(req.ret));
            }
        }else{
            //socket.io use of auth function
            var failed = function(){
                //maybe log
            }
        }
        var clearAfterTime=function(){
            //remove temp key from memory
            clearTimeout(s.api[params.auth].timeout)
            s.api[params.auth].timeout=setTimeout(function(){
                delete(s.api[params.auth])
            },1000*60*5)
        }
        //check IP address of connecting user
        var finish=function(user){
            if(s.api[params.auth].ip.indexOf('0.0.0.0')>-1||s.api[params.auth].ip.indexOf(params.ip)>-1){
                if(!user.lang){
                    var details = s.parseJSON(user.details).lang
                    user.lang = s.getDefinitonFile(user.details.lang) || s.copySystemDefaultLanguage()
                }
                cb(user);
            }else{
                failed();
            }
        }
        //check if auth key is user's temporary session key
        if(s.group[params.ke]&&s.group[params.ke].users&&s.group[params.ke].users[params.auth]){
            s.group[params.ke].users[params.auth].permissions={};
            if(!s.group[params.ke].users[params.auth].lang){
                s.group[params.ke].users[params.auth].lang = s.copySystemDefaultLanguage()
            }
            cb(s.group[params.ke].users[params.auth])
        }else{
            //check if key is already in memory to save query time
            if(s.api[params.auth]&&s.api[params.auth].details){
                finish(s.api[params.auth]);
                if(s.api[params.auth].timeout){
                   clearAfterTime()
                }
            }else{
                //no key in memory, query db to see if key exists
                //check if using username and password in plain text or md5
                if(params.username&&params.username!==''&&params.password&&params.password!==''){
                    s.sqlQuery('SELECT * FROM Users WHERE mail=? AND (pass=? OR pass=?)',[params.username,params.password,s.createHash(params.password)],function(err,r){
                        if(r&&r[0]){
                            r=r[0];
                            r.ip='0.0.0.0';
                            r.auth = s.gid(20);
                            params.auth = r.auth;
                            r.details=JSON.parse(r.details);
                            r.permissions = {};
                            s.api[r.auth]=r;
                            clearAfterTime();
                            finish(r);
                        }else{
                            failed();
                        }
                    })
                }else{
                    //not using plain login
                    s.sqlQuery('SELECT * FROM API WHERE code=? AND ke=?',[params.auth,params.ke],function(err,r){
                        if(r&&r[0]){
                            r=r[0];
                            s.api[params.auth]={ip:r.ip,uid:r.uid,ke:r.ke,permissions:JSON.parse(r.details),details:{}};
                            s.sqlQuery('SELECT mail,details FROM Users WHERE uid=? AND ke=?',[r.uid,r.ke],function(err,rr){
                                if(rr&&rr[0]){
                                    rr=rr[0];
                                    try{
                                        s.api[params.auth].mail=rr.mail
                                        s.api[params.auth].details=JSON.parse(rr.details)
                                        s.api[params.auth].lang=s.getLanguageFile(s.api[params.auth].details.lang)
                                    }catch(er){}
                                }
                                finish(s.api[params.auth]);
                            })
                        }else{
                            s.sqlQuery('SELECT * FROM Users WHERE auth=? AND ke=?',[params.auth,params.ke],function(err,r){
                                if(r&&r[0]){
                                    r=r[0];
                                    r.ip='0.0.0.0'
                                    s.api[params.auth]=r
                                    s.api[params.auth].details=JSON.parse(r.details)
                                    s.api[params.auth].permissions={}
                                    clearAfterTime()
                                    finish(r)
                                }else{
                                    failed();
                                }
                            })
                        }
                    })
                }
            }
        }
    }
    //super user authentication handler
    s.superAuth = function(params,callback,res,req){
        var userFound = false
        var userSelected = false
        var adminUsersSelected = null
        try{
            var success = function(){
                var chosenConfig = config
                if(req && res){
                    chosenConfig = s.getConfigWithBranding(req.hostname)
                    res.setHeader('Content-Type', 'application/json');
                    var ip = req.headers['cf-connecting-ip']||req.headers["CF-Connecting-IP"]||req.headers["'x-forwarded-for"]||req.connection.remoteAddress;
                    var resp = {
                        ok: userFound,
                        ip: ip
                    }
                    if(userFound === false){
                        resp.msg = lang['Not Authorized']
                        res.end(s.prettyPrint(resp))
                    }
                    if(userSelected){
                        resp.$user = userSelected
                    }
                    if(adminUsersSelected){
                        resp.users = adminUsersSelected
                    }
                }
                callback({
                    ip : ip,
                    $user:userSelected,
                    users:adminUsersSelected,
                    config: chosenConfig,
                    lang:lang
                })
            }
            var foundUser = function(){
                if(params.users === true){
                    s.sqlQuery('SELECT * FROM Users WHERE details NOT LIKE ?',['%"sub"%'],function(err,r) {
                        adminUsersSelected = r
                        success()
                    })
                }else{
                    success()
                }
            }
            if(params.auth && s.superUsersApi[params.auth]){
                userFound = true
                userSelected = s.superUsersApi[params.auth].$user
                foundUser()
            }else{
                var superUserList = JSON.parse(fs.readFileSync(s.location.super))
                superUserList.forEach(function(superUser,n){
                    if(
                        userFound === false &&
                        (
                            params.auth && superUser.tokens && superUser.tokens[params.auth] || //using API key (object)
                            params.auth && superUser.tokens && superUser.tokens.indexOf && superUser.tokens.indexOf(params.auth) > -1 || //using API key (array)
                            (
                                params.mail && params.mail.toLowerCase() === superUser.mail.toLowerCase() && //email matches
                                (
                                    params.pass === superUser.pass || //user give it already hashed
                                    superUser.pass === s.createHash(params.pass) || //hash and check it
                                    superUser.pass.toLowerCase() === s.md5(params.pass).toLowerCase() //check if still using md5
                                )
                            )
                        )
                    ){
                        userFound = true
                        userSelected = superUser
                        foundUser()
                    }
                })
            }
        }catch(err){
            console.log('The following error may mean your super.json is not formatted correctly.')
            console.log(err)
        }
        if(userFound === true){
            return true
        }else{
            if(res)res.end(s.prettyPrint({
                ok: false,
                msg: lang['Not Authorized']
            }))
            return false
        }
    }
    s.basicOrApiAuthentication = function(username,password,callback){
        var splitUsername = username.split('@')
        if(splitUsername[1] && splitUsername[1].toLowerCase().indexOf('shinobi') > -1){
            s.sqlQuery('SELECT ke,uid FROM API WHERE code=? AND ke=?',[
                splitUsername[0], //code
                password //ke
            ],function(err,r){
                var apiKey
                if(r && r[0]){
                    apiKey = r[0]
                }
                callback(err,apiKey)
            })
        }else{
            s.sqlQuery('SELECT ke,uid FROM Users WHERE mail=? AND (pass=? OR pass=?)',[
                username,
                password,
                s.createHash(password)
            ],function(err,r){
                var user
                if(r && r[0]){
                    user = r[0]
                }
                callback(err,user)
            })
        }
    }
}
