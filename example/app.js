var express = require('express')
	, mailQueuer = require('../lib/mail-queuer')
	, mongoose = require("mongoose")
	, http = require('http')
	, path = require('path')
	, config = require('./config')
	, nodemailer = require("nodemailer");

mongoose.connect('mongodb://localhost/mail-queuer');

//发送邮件，基于nodemailer
function sendMail(options, callback){
	//关于发送邮件的代码，请参考nodemailer，也可以用其它的邮件发送方案
	var transport = nodemailer.createTransport("SMTP", {
		service: "Gmail",
		auth: config.mailAuth
	});

	transport.sendMail({
		from: config.mailAuth.user,
		to: options.receiver,
		subject: options.subject,
		html: options.html
	}, function(err, res){
		if(err){
			console.log("发送邮件失败，原因：" + err.message);
		};
		transport.close();
		callback(err);
	});
};

var app = express();
app.configure(function(){
	var options = {
		//模板路径
		templatePath: __dirname + "/template/",
		//模板对应的配置
		subjectTemplate: config.subjectTemplate,
		//每发一份邮件，休息多长的时间再发送
		sleep: 0,
		//限制指定IP才能发起邮件请求
		ip: null,
		//握手的token，用于校验发起请求方
		token: "mail-queuer"
	};

	app.set('port', process.env.PORT || 3000);
	app.set('views', __dirname + '/views');
	app.set('view engine', 'jade');
	app.use(express.bodyParser());
	app.use(express.methodOverride());
	//初始化mail-queuer
	app.use(mailQueuer.initialize(mongoose, options, sendMail));
	app.use(app.router);
});


//添加新的任务
app.post("/newTask", function(req, res, next){
	mailQueuer.newTask(req, res, next);
});

//模拟提交任务端
app.get("/", function(req, res, next){
	//要发送的数据
	var postData = {
		subject: JSON.stringify({name: "Conis"}),
		data: JSON.stringify({date: new Date().toLocaleDateString()}),
		template: "welcome",
		language: "zh_CN",
		token: "mail-queuer",
		receiver: config.mailAuth.user
	};
	var postDataString = JSON.stringify(postData);

	var ops = {
		host: req.host,
		port: app.get('port'),
		method: "POST",
		path: "/newTask",
		headers: {
			'Content-Type': 'application/json',
			'Content-Length': postDataString.length
		}
	};

	var request = http.request(ops, function(response){});
	request.write(postDataString);

	res.send("Done");
});

http.createServer(app).listen(app.get('port'), function(){
	console.log("Express server listening on port " + app.get('port'));
});
