const bcrypt = require('bcrypt');
const {PubSub} = require('@google-cloud/pubsub');
const {User} = require('../../models');

require("../../config/logger");
const winston = require("winston");
const pubSubClient = new PubSub();
const webappLogger = winston.loggers.get("webappLogger");

const createUser = async (req, res, next) => {
    webappLogger.info("request started for create user"); 
    const { first_name, last_name, password, username } = req.body;
   
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    try {
        const existingUser = await User.findOne({ where: { username } });
        if (!emailRegex.test(username)) {
            webappLogger.error("error in email error");
            return res.status(400).send('Invalid email address');
        }
        if (existingUser) {
            webappLogger.error("existing user error");
            return res.status(400).send();
        }
        
        const hashedPassword = await bcrypt.hash(password, 10);
        const user = await User.create({
            first_name,
            last_name,
            password: hashedPassword,
            username
        });

        if(user){
            const { password, isVerified, token, tokenExpiration, ...userWithoutPassword } = user.toJSON();
            if(process.env.NODE_ENV  != 'test'){
                const topicName = process.env.TOPIC_NAME;
                const message = JSON.stringify(userWithoutPassword);
                const dataBuffer = Buffer.from(message);
                const messageId = await pubSubClient.topic(topicName).publishMessage({data:dataBuffer});
                webappLogger.info(`Message ${messageId} published.`);
            }
            res.status(201).send(userWithoutPassword);
        } else {
            webappLogger.error("user not created");
            res.status(400).send();
        }
        
    } catch (error) {
        console.log(error);
        webappLogger.error("error"+error);
        return res.status(400).send();
    }
}


const getUserInfo = async (req, res, next) => {
    webappLogger.info("request started for getUserInfo"); 
    const authHeader = req.headers.authorization;
    if(!authHeader){
       return res.status(401).send();
    }
    const [usernameProvided, passwordProvided] = Buffer.from(authHeader.split(' ')[1], 'base64').toString().split(':');
    
    try {
        const user = await User.findOne(
            {
                where : { username : usernameProvided }
            });

        if (!user) {
            webappLogger.error("cannot find user");
            return res.status(401).send();
        }

        if (process.env.NODE_ENV != "test" && !user.isVerified) {
            webappLogger.error("user is not verified");
            return res.status(401).send();
        }    

        const isMatch = bcrypt.compareSync(passwordProvided, user.password);

        if (!isMatch) {
            webappLogger.error("incorrect password");
            return res.status(401).send();
        }
        
        const { password, isVerified, token, tokenExpiration, ...userWithoutPassword } = user.toJSON();
        return res.status(200).send(userWithoutPassword);
    } catch (error) {
        webappLogger.error("error"+error);
        return res.status(400).send();
    }

}


const updateUser = async (req, res, next) => {
    webappLogger.info("request started for updateUser"); 
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Basic ')) {
        webappLogger.error("No authorization header");
        return res.status(401).send();
    }

    const base64Credentials = authHeader.split(' ')[1];
    const credentials = Buffer.from(base64Credentials, 'base64').toString('utf-8');
    const [usernameProvided, passwordProvided] = credentials.split(':');
    
    try {
        const user = await User.findOne({ where: { username : usernameProvided } });


        if (!user || !(await bcrypt.compare(passwordProvided, user.password))) {
            webappLogger.error("user not found or password incorrect");
            return res.status(401).send();
        }

        if (process.env.NODE_ENV != "test" && !user.isVerified) {
            webappLogger.error("user is not verified");
            return res.status(401).send();
        }    

        const { first_name, last_name, password, username} = req.body;
        console.log(username);
        if(username){
            webappLogger.error("username cannot be updated");
            return res.status(400).send();
        }
        if (password) {
            const hashedPassword = await bcrypt.hash(password, 10);
            user.password = hashedPassword;
        }

        if (first_name) {
            user.first_name = first_name;
        }

        if (last_name) {
            user.last_name = last_name;
        }
        await user.save();
        res.status(204).send();
    } catch (error) {
        console.log(error);
        webappLogger.error("error"+error);
        return res.status(400).send();
    }
};
module.exports = {
    createUser,
    getUserInfo,
    updateUser
};