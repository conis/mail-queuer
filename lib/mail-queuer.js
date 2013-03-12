/**
 * Created with JetBrains WebStorm.
 * User: conis
 * Date: 3/10/13
 * Time: 4:49 下午
 * To change this template use File | Settings | File Templates.
 */
var _jade = require("jade");
var _path = require("path");
var _fs = require("fs");

function mailQueuer(){
	//是否正在执行
	this.running = false;
	this.status = {
		normal: 0,
		sendFail: 1
	};
}

mailQueuer.prototype.initialize = function(mongo, options, mailer){
	//建立Schema
	var Schema = mongo.Schema;
	var table = new Schema({
		//邮件的标题
		subject: {type: String},
		//body的JSON数据
		body: {type: String},
		//邮件接收者的JSON数据
		receiver: {type: String},
		//是否发送成功的标志
		status: {type: Number},
		//使用哪个模板
		template: {type: String},
		//用哪一种语言发送
		language: {type: String},
		//发送的时间戳
		timestamp: {type: Number}
	});

	var tableName = 'mail_queue';
	mongo.model(tableName, table);
	this.schema = mongo.model(tableName);

	this.mailer = mailer;
	this.options = options || {};

	//开始执行任务
	this.nextTask();
	return function(req, res, next){
		next();
	};
	//return initialize().bind(this);
}

//招待下一个任务
mailQueuer.prototype.nextTask = function(){
	if(this.running) return;
	this.running = true;

	var that = this;
	setTimeout(function(){
		that.doTask();
	}, this.options.sleep || 50);
}

//记录错误
mailQueuer.prototype.errorRecorder = function(message, more){
	var text = new Date() + "; Error: " + message + "; More: " + more;
	console.log(text);
};

//执行一个任务
mailQueuer.prototype.doTask = function(){
	//从数据库中取出一条记录
	var sort = {sort: [["timeStamp", -1]]};
	var cond = {status: this.status.normal};
	var that = this;
	this.schema.findOne(cond, null, sort, function(err, doc){
		//发生错误
		if(err) return that.errorRecorder(err.message);
		//队列已经执行完毕，找不到数据
		if(!doc){
			that.running = false;
			return;
		};

		that.sendMail(doc,function(err){
			//发生错误，标识status
			if(err){
				doc.status = that.status.sendFail;
				that.errorRecorder("发送邮件失败");
				doc.save(function(err){
					if(err) that.errorRecorder(err.message);
					that.running = false;
					that.nextTask();		//执行下一个任务
				});
				return;
			};

			//发送没有错误，删除这个queue
			doc.remove(function(err){
				if(err) return that.errorRecorder(err.message);
				that.running = false;
				that.nextTask();		//执行下一轮
			});		//end remove
		});			//end sendMail
	});
}

/*
 * 渲染邮件
 * 查找模板规则，模板名称/语言.jade，如果没有找到，就用模板名称/en.jade
 */
mailQueuer.prototype.renderMail = function(doc, callback){
	var language = doc.language || "";
	var file = _path.join(this.options.templatePath, doc.template);
	//检查指定语文的模板是否存在
	var template = _path.join(file, language + ".jade");
	if(!_fs.existsSync(template)){
		//不存在，用默认语言的模板
		template = _path.join(file, "en" +  ".jade");
	};

	//没有找到模板文件
	if(!_fs.existsSync(template)){
		return callback(new Error("template " + doc.template + " not found"));
	}

	var content = _fs.readFileSync(template, "utf-8");
	//渲染
	_jade.render(content, {
		pretty: true,
		data: JSON.parse(doc.body)
	}, function(err, html){
		if(err) return callback(err);
		callback(null, html);
	});
};

/*
 * 获取邮件的标题
 *
 */
mailQueuer.prototype.getSubject = function(subject, template, language){
	subject = JSON.parse(subject);
	var subjects = this.options.subjectTemplate || {};
	var subTemplate = subjects[template];
	if(subTemplate){
		subTemplate = subTemplate[language] || subTemplate["en"];
	};

	if(!subTemplate) return subject.text || "";
	var text = subTemplate;
	for(var key in subject){

		text = text.replace('%' + key + '%', subject[key]);
	};

	return text;
};

//发送邮件
mailQueuer.prototype.sendMail = function(doc, callback){
	var that = this;
	this.renderMail(doc, function(err, content){
		if(err) return callback(err);

		var subject = that.getSubject(doc.subject, doc.template, doc.language);
		that.mailer({
			subject: subject,
			html: content,
			receiver: doc.receiver
		}, callback);
	});
};

//添加一个邮件任务到数据库
mailQueuer.prototype.newTask = function(req, res, next){
	var subject = req.body.subject		//邮件标题
		, data = req.body.data					//邮件内容的数据
		, language = req.body.language	//邮件模板使用的语言
		, token = req.body.token				//用于校验的token
		, receiver = req.body.receiver	//收件人
		, template = req.body.template			//用哪一个发送者的配置文件发送
		, that = this;

	//认证错误，返回403
	if(!this.authenticate(token, req)){
		console.log("认证出错，请检查IP限制与token")
		return res.send(403);
	};

	//保存数据到数据库
	var doc = new this.schema();
	doc.subject = subject;
	doc.body = data;
	doc.language = language;
	doc.template = template;
	doc.receiver = receiver;
	doc.status = this.status.normal;

	doc.save(function(err){
		//启动发送任务
		that.nextTask();
		res.send(err ? 500 : 200);
	});
}


//鉴定用户
mailQueuer.prototype.authenticate = function(token, req){
	//判断token是否正确
	if(this.options.token !== token) return false;
	//不限制ip
	if(!this.options.ip) return true;
	//获取ip地址
	var ipAddress;
	var forwardedIpsStr = req.header('x-forwarded-for');
	if (forwardedIpsStr) {
		var forwardedIps = forwardedIpsStr.split(',');
		ipAddress = forwardedIps[0];
	}

	ipAddress = ipAddress || req.connection.remoteAddress;
	if(!ipAddress) return false;

	//校验
	var list = this.options.ip;
	var find = false;
	for(var i = 0; i < list.length; i ++){
		var tmp = list[i];
		if(typeof tmp === "string"){
			find = tmp == ipAddress;
		}else if(typeof tmp === "object"){
			//正则表达式
			find = new RegExp(tmp).test(ipAddress);
		};

		//请求的ip匹配正确
		if(find) return true;
	}

	return false;
}

exports = module.exports = new mailQueuer();