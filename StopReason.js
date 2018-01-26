//input the err, e
//get the stop selector
//find where it stops and identify reason


class StopReason{
	constructor(scenarioContent,err){
		this.scenarioContent = scenarioContent;
		this.noiseInfo = scenarioContent.noiseInfo;
		this.baseActions = scenarioContent.baseActions;
		this.err = err.toString();
	}

	async stopReason(){		
		
		const unableFind = 'Unable to find element by selector:';
		if(this.err.indexOf(unableFind) !== -1){
			var errStr = this.err;
			var errArray = errStr.split("selector: ");
			this.errSelector = errArray[1];

			var errNoise = await this.errSelectorInNoiseInfo();

			if(errNoise !== null ){
				//the errNoise is FalseCandidate.  FPCA
				let errResult = {"type" : "FPCA", "bid": this.scenarioContent.bid, "noiseInfo": errNoise};
				return errResult;

			} else {
				let errIndex = await this.errSelectorInBaseScenario();
				let noiseTPCA_OUT = await this.checkNoiseInfo(errIndex);
				let errResult = {"type" : "TPCA_OUT", "bid": this.scenarioContent.bid, "noiseInfo": noiseTPCA_OUT};
				return errResult;
			}

		} else {
			console.log('it is not unableFind err in stopLocation :');
			console.log(this.err);
			var errResult = 'notUnableFindErr';
			return errResult;
		}

	}

	async errSelectorInNoiseInfo(){

		for (var i = 0; i < this.noiseInfo.length; i++) {
			let actionStr = JSON.stringify(this.noiseInfo[i].action);

			if(actionStr.indexOf(this.errSelector) !== -1){
				return this.noiseInfo[i];
			}

			if ( i === this.noiseInfo.length -1 ){
				return null;
			}
		}

	}

	async errSelectorInBaseScenario(){
		for (var i = 0; i < this.baseActions.length; i++) {
			let actionStr = JSON.stringify(this.baseActions[i]);
			if ( actionStr.indexOf(this.errSelector) !== -1){
				return i -1 ;
			}
		}
	}

	async checkNoiseInfo(errIndex){
		for (var i = 0; i < this.noiseInfo.length; i++) {
			if(this.noiseInfo[i].preIndex === errIndex) {
				return this.noiseInfo[i];
			}
		}
	}
}


module.exports.StopReason = StopReason;
