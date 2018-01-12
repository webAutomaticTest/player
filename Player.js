const winston = require('winston');
const Nightmare = require('nightmare');
const amqp = require('amqplib');
const MongoClient = require('mongodb').MongoClient;
const ObjectID = require('mongodb').ObjectID;
const wat_action = require('wat_action_nightmare');
const QUEUE_NAME = 'player_queue';

const TIME_OUT = 40000;

function Player (serverNames) {
	this.dbUrl = `mongodb://${serverNames.mongoServerName}:27018/wat_storage`;
	this.rmqUrl = `amqp://${serverNames.rabbitServerName}`;
	winston.info(`New Player (${this.dbUrl}) (${this.rmqUrl})`);

	this.start = start;
}


function start() {
	winston.info('Player Started');
	amqp.connect(this.rmqUrl)
	.then(conn => {
		winston.info('connected');
		this.connection = conn;
		return conn.createConfirmChannel();
	})
	.then(ch => {
		winston.info('channel created');
		this.ch = ch;
		this.ch.assertQueue(QUEUE_NAME, { durable: true });
		winston.info('Queue Created');
		this.ch.prefetch(1);
		this.ch.consume(QUEUE_NAME, async (scenarioMsg) => {
			if (scenarioMsg !== null) {
				await playScenario.call(this, scenarioMsg);
				await console.log("play finish");
				await this.ch.sendToQueue(scenarioMsg.properties.replyTo,
					new Buffer("true"),
					{correlationId: scenarioMsg.properties.correlationId});
				await this.ch.ack(scenarioMsg);
			}
		});
	})
	.catch(err => {
		winston.info(err);
		setTimeout(() => {
			this.start(); 
		}, 2000);
	});
}

async function playScenario(scenarioMsg) {
	const scenarioContent = await JSON.parse(scenarioMsg.content.toString());
	await winston.info(`Player Begins To Play A Scenario : ${scenarioContent._id}`);
	const actions = await createWATScenario(scenarioContent);
	const scenario = new wat_action.Scenario(actions);
	await winston.info(scenario.toString());

	const browser = new Nightmare({show:true, loadTimeout: TIME_OUT , gotoTimeout: TIME_OUT, switches:{'ignore-certificate-errors': true}});

	await scenario.attachTo(browser)
	.evaluate( (assert) => {
		if (assert && !assert.end) {
			var testedElement = document.getElementById(assert.selector);
			var obtained;
			switch (assert.property) {
				case 'value' : obtained = testedElement.value;
				break;
				case 'innerHTML' : obtained = testedElement.innerHTML;
				break;
				default : obtained = '';
			}
			return obtained.indexOf(assert.contains) !== -1;
		} else {
			return true;
		}
	},scenarioContent.assert)
	.then(async (testResult) => {

		await winston.info('Scenario Success');
		var _id = ObjectID();
		await browser.screenshot().end().then();
		if (testResult) {
			await recordSuccessfulRun.call(this, scenarioMsg, _id);
		} else {
			var error = 'assertion fails';
			await recordErrorRun.call(this, scenarioMsg, _id, error);	
		}
	})
	.catch(async (e) => {
		await winston.info('Scenario Error');
		await winston.info(e);
		var _id = ObjectID();
		await browser.screenshot().end().then();
		await recordErrorRun.call(this, scenarioMsg, _id, e);
	});
}

function createWATScenario(scenario) {
	var wait = scenario.wait || 0;
	var cssSelector = scenario.cssselector || 'watId';
	var actions = [];
	winston.info(cssSelector);
	console.log(scenario.actions);
	scenario.actions.forEach((action) => {
		var watAction = {
			type: action.type
		};
		watAction.header = action.header || undefined;
		watAction.url = action.url || undefined;
		watAction.text = action.text || undefined;
		if (action.selector) {
			watAction.selector = action.selector[cssSelector];
			if (actions.length
				&& action.type === 'TypeAction'
				&& actions[actions.length - 1].type === 'TypeAction'
				&& actions[actions.length - 1].selector === action.selector[cssSelector]) {
				actions.pop();
		}
	}
	actions.push(watAction);
});

	if (wait > 0) {
		var actionsWithWait = [];
		for (let index = 0; index < actions.length ; index++) {
			actionsWithWait.push(actions[index]);
			actionsWithWait.push({
				type: 'WaitAction',
				ms: Number(wait)
			});
		}
		return actionsWithWait;
	} else {
		return actions;
	}
}

async function recordSuccessfulRun(scenarioMsg, _id) {
	await winston.info('Record Successful Run');
	var scenarioObj = await JSON.parse(scenarioMsg.content.toString());
	var sid = scenarioObj._id;
	var uid = scenarioObj.uid;
	await MongoClient.connect(this.dbUrl)
	.then( async (db) => {
		await db.collection('run', async (err, runCollection) => {
			if (err) {
				winston.error(err);
			} else {
				var newRun = {
					sid : new ObjectID(sid),
					uid : new ObjectID(uid),
					isSuccess : true,
					read : false,
					date : new Date().toJSON(),
					_id : _id
				};
				await runCollection.save(newRun)
				.then( async() => {
					await winston.info('Successful Run Has Been Saved');
				}).catch(err => {
					winston.error(err);
				});
			}
		});
	}).catch(err => {
		winston.error(err);
	});
}

async function recordErrorRun(scenarioMsg, _id, error) {
	var scenarioObj = await JSON.parse(scenarioMsg.content.toString());
	var sid = scenarioObj._id;
	var uid = scenarioObj.uid;
	await winston.info(`Record Error Run of scenario ${sid}`);
	await MongoClient.connect(this.dbUrl)
	.then(async (db) => {
		await db.collection('run', async (err, runCollection) => {
			if (err) {
				winston.error(err);
			} else {
				var newRun = {
					sid : new ObjectID(sid),
					uid : new ObjectID(uid),
					isSuccess : false,
					read : false,
					error : error,
					date : new Date().toJSON(),
					_id : _id  
				};
				await runCollection.save(newRun)
				.then( async () => {
					await winston.info('Error Run Has Been Saved');
				}).catch(err => {
					winston.error(err);
				});
			}
		});
	}).catch(err => {
		winston.error(err);
	});
}


module.exports.Player = Player;