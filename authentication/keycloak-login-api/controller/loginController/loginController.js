const router = require('express').Router();
// const { // logger } = require('../../lib/// logger');
// const auth = require('../../middleware/check-auth');
const axios = require('axios');
const dotenv = require('dotenv');
// const querystring = require('querystring');
// const qr = require('qrcode');

// const common = require('./common');
// const { generateSecret, verify } = require('2fa-util');
// const db = require('../keycloakDB/db')
dotenv.config();
const authURL = process.env.AUTH_API
const keyCloakURL = process.env.KEYCLOAK_HOST
const keyClockRealm = process.env.KEYCLOAK_REALM
const keyClockClient = process.env.KEYCLOAK_CLIENT

router.post('/login', async (req, res, next) => {
    console.log('testings')
    const { email, password } = req.body;
    let role = '';
    let userStatus = ''

    if (!email || !password) {
        return next(new ErrorResponse('Please provide an email and password', 400));
    }

    try {
        let keycloakheaders = {
            "Content-Type": "application/x-www-form-urlencoded",
        }

        let keyCloakdetails = new URLSearchParams({
            client_id: keyClockClient,
            username: req.body.email,
            password: req.body.password,
            grant_type: 'password',

        });

        let kcUrl = `${keyCloakURL}/auth/realms/${keyClockRealm}/protocol/openid-connect/token`



        await axios.post(kcUrl, keyCloakdetails, { headers: keycloakheaders }).then(resp => {
            // logger.info('---token generated from keyclock ---');
            let response = resp['data']
            let jwt = resp['data'].access_token;

            let username = ''
            let userId = ''
            if (resp.status === 200) {
                const decodingJWT = (token) => {
                    if (token !== null || token !== undefined) {
                        const base64String = token.split('.')[1];
                        const decodedValue = JSON.parse(Buffer.from(base64String,
                            'base64').toString('ascii'));

                        if (decodedValue.realm_access.roles.includes('admin')) {
                            role = 'admin'
                        }
                        if (decodedValue.realm_access.roles.includes('report_viewer')) {
                            role = 'report_viewer'
                        }
                        if (decodedValue.realm_access.roles.includes('emission')) {
                            role = 'emission'
                        }

                        username = decodedValue.preferred_username;
                        userId = decodedValue.sub

                        return decodedValue;
                    }
                    return null;
                }
                decodingJWT(jwt)
            };

            res.send({ token: jwt, role: role, username: username, userId: userId, res: response })
        }

        ).catch(error => {

            res.status(404).json({ errMessage: `${error}` })

        })



    } catch (error) {
      
        res.status(404).json(`Error :: ${error}`)
    }
})

// router.post('/adduser', async (req, res, next) => {
//     const { email } = req.body
//     // // logger.info('---new user added ---');
//     db.query('INSERT INTO keycloak_users (keycloak_username, status) VALUES ($1, $2)', [req.body.username, "false"], (error, results) => {
//         if (error) {
//             // // logger.info('---user create in DB error ---');
//             throw error
//         }
//         // // logger.info('---user created in DB success ---');
//         res.status(201).json({ msg: "User Created" });
//     })

// })
router.post('/getTotp', async (req, res, next) => {
    const { email, password } = req.body;

    const secret = await generateSecret(email, 'cQube');
    db.query('UPDATE keycloak_users set qr_secret= $2 where keycloak_username=$1;', [req.body.email, secret.secret], (error, results) => {
        if (error) {
            // logger.info('---QR code from DB error ---');
            throw error
        }
        // logger.info('---qr code from DB success ---');
        res.status(201).json({ msg: "qrcode saved" });

    })
    return res.json({
        message: 'TFA Auth needs to be verified',
        tempSecret: secret.secret,
        dataURL: secret.qrcode,
        tfaURL: secret.otpauth
    })
})

router.post('/logout', async (req, res, next) => {

    let headers = {
        "Content-Type": "application/x-www-form-urlencoded",
    }
    let details = new URLSearchParams({
        client_id: keyClockClient,
        refresh_token: req.body.refToken

    });
    let logoutUrl = `${keyCloakURL}/auth/realms/${keyClockRealm}/protocol/openid-connect/logout`

    await axios.post(logoutUrl, details, { headers: headers }).then(resp => {
        return res.send({
            status: 200
        })
    }).catch(err => {
        // logger.error(`Error :: ${ err }`)
        res.status(404).json({ errMessage: "Internal error. Please try again!!" })
    })


})

router.post('/getSecret', async (req, res) => {

    const { username } = req.body

    db.query('SELECT qr_secret FROM keycloak_users WHERE keycloak_username = $1', [req.body.username], (error, results) => {
        if (error) {
            // logger.info('---user secrect from DB error  ---');
            throw error
        }
        // logger.info('---user secrect from DB success  ---');
        res.send({ status: 200, secret: results.rows[0].qr_secret })

    })
});


router.post('/totpVerify', async (req, res) => {
    const { secret, token } = req.body

    let isVerified = await verify(token, secret);

    if (isVerified) {
        return res.send({
            "status": 200,
            "message": "Two-factor Auth is enabled successfully",
            "loginedIn": common.userObject.loginedIn
        });
    }

    return res.send({
        "status": 403,
        "message": "Invalid Auth Code"
    });
});

module.exports = router;