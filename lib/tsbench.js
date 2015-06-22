var fs = require('fs');
var path = require('path');
var _ = require('lodash');
var yaml = require('js-yaml');

var inquirer = require('inquirer');

var argv = require('minimist')(process.argv.slice(2));

var currentDir = process.cwd();

var gatlingHome = path.join(__dirname, '..', 'gatling');

var scenarioPath = path.join(currentDir, argv.s);
var testDataPath = path.join(currentDir, argv.t);

if (!fs.existsSync(gatlingHome)) {

    inquirer.prompt({
        type: 'confirm',
        name: 'install',
        message: 'It seems like gatling is not installed.\nDo you want to download it now?'
    }, function (answers) {
        if (answers.install) {

            var request = require('request');
            var file = fs.createWriteStream(gatlingHome + '.zip');

            request("https://leipert.io/download/gatling.zip")
                .pipe(file)
                .on('close', function () {
                    console.log('File written!');
                    var AdmZip = require('adm-zip');

                    var zip = new AdmZip(gatlingHome + '.zip');

                    zip.extractAllTo(gatlingHome, /*overwrite*/true);

                    console.log('Successfully downloaded gatling.\nOn OSX/Linux run:\nchmod +x ' + gatlingHome + '/bin/gatling.sh');

                });

        }
    })

} else {
    loadYAMLS();
}

function loadYAMLS() {

    try {
        var scenario = yaml.safeLoad(fs.readFileSync(scenarioPath, 'utf8'));
    } catch (e) {
        console.log('Could not load ' + scenarioPath + '\nPlease make sure it exists and is a valid yaml file.');
        throw e;
    }

    try {
        var testdata = yaml.safeLoad(fs.readFileSync(testDataPath, 'utf8'));
    } catch (e) {
        console.log('Could not load ' + testDataPath + '\nPlease make sure it exists and is a valid yaml file.');
        throw e;
    }


    String.prototype.capitalizeFirstLetter = function () {
        return this.charAt(0).toUpperCase() + this.slice(1);
    };

    var testDSL = _.assign({}, scenario, testdata);

    var checks = require('./checks');

    checks(testDSL);

    var prepareDSL = require('./convertDSL');

    var gatling = require('./convertToGatling');

    var preparedDSL = (prepareDSL(testDSL.queries, testDSL.uriSets, testDSL.limit));

    preparedDSL = gatling.getQueryDSL(preparedDSL);

    var name = _.camelCase(testDSL.name).capitalizeFirstLetter();

    var scenarios = gatling.getScenarios(testDSL.servers, testDSL.headers, preparedDSL);

    var testClass = gatling.getTestClass(name, testDSL.servers, scenarios);

    inquirer.prompt([{
        type: 'input',
        'default': name,
        name: 'name',
        message: 'How should this test run be named?'
    }, {
        type: 'confirm',
        name: 'run',
        message: 'Do you want to run the tests now?'
    }], function (answers) {

        var mkdir = require('mkdirp');

        answers.name = answers.name + '-' + Math.floor(Date.now() / 1000);

        var resultDir = path.join(currentDir, 'specs', answers.name, 'result');
        var testDir = path.join(currentDir, 'specs', answers.name, 'test');

        mkdir.sync(resultDir);
        mkdir.sync(testDir);

        fs.writeFileSync(
            path.join(testDir, name + '.scala'),
            testClass
        );

        console.log("Test generated in " + path.join(currentDir, 'specs', answers.name));

        var gatlingExec = (process.platform.lastIndexOf('win') === 0) ?
            path.join(gatlingHome, 'bin/gatling.bat') :
            path.join(gatlingHome, 'bin/gatling.sh');

        if (answers.run) {

            var childProcess = require('child_process');

            var subshell = childProcess.spawn(gatlingExec, [
                '-m',
                '-sf', testDir,
                '-rf', resultDir
            ]);

            subshell.stdout.pipe(process.stdout);
            subshell.stderr.pipe(process.stderr);

        } else {
            console.log('To run this test, run\n' + gatlingExec + ' -m -sf ' + testDir + ' -rf ' + resultDir)
        }


    });


}


