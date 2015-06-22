var _ = require('lodash');

var scenarioTemplate =
    _.template('val <%= name %>Conf = http.baseURL("<%= url %>")<%= headers %>\n' +
    'val <%= name %> = scenario("<%= name %>")\n.<%= dsl %>');

var simulationTemplate =
    _.template('' +
    'import io.gatling.core.Predef._\n' +
    'import io.gatling.http.Predef._\n' +
    'import scala.concurrent.duration._\n\n' +
    'class <%= name %> extends Simulation {\n<%= scenarios %>\n<%= setUp %>}');

module.exports = {
    getQueryDSL: function (dsl) {
        if (_.isArray(dsl)) {
            return _convertSPARQLQueries2GatlingDSL(dsl, '.');
        } else {
            return _convertSPARQLQuery2GatlingDSL(dsl);
        }
    },
    getScenarios: function (servers, headers, dsl) {

        return _.reduce(servers, function (result, value) {
            var currentDSL = _.template(dsl)({serverName: servers.length > 1 ? value.name + '.' : ''})
            result = result.concat('\n\n').concat(_getScenario(value, headers, currentDSL));
            return result
        }, '');

    },
    getTestClass: function(name, servers, scenarios){
        return simulationTemplate({name: name, scenarios: scenarios, setUp: _getSetUp(servers)});
    }
};

function _getSetUp(servers){
    return 'setUp(' +
        _.map(servers, function (value) {
            return value.name + '.inject(rampUsers(100) over (20 seconds)).protocols('+ value.name + 'Conf)'
        }).join(',\n')
        + ')';
}

function _getScenario(server, headers, dsl) {

    return scenarioTemplate(_.extend(server, {headers: _getHeaders(headers), dsl: dsl}))
}

function _getHeaders(headers) {
    if (_.isObject(headers) && !_.isEmpty(headers)) {
        return '.headers(Map(' +
            _.map(headers, function (value, key) {
                return '"' + key + '" -> "' + value + '"';
            }).join(',')
            + '))';
    }
    return '';
}

function _convertSPARQLQueries2GatlingDSL(dsl, separator) {
    return _.chain(dsl)
        .map(_convertSPARQLQuery2GatlingDSL)
        .compact()
        .value()
        .join('\n'.concat(separator));
}

function _convertSPARQLQuery2GatlingDSL(dslElement) {
    switch (dslElement.type) {
        case 'query':
            return 'exec(http("<%= serverName %>'
                .concat(dslElement.name)
                .concat('").get("')
                .concat(encodeURIComponent(dslElement.query))
                .concat('"))')
                .concat('.pause( 1, 2)');
        case 'randomSwitchElement':
            return '\n'
                .concat(dslElement.weight)
                .concat('d -> \n')
                .concat(_convertSPARQLQueries2GatlingDSL(dslElement.items, '.'));
        case 'randomSwitch':
            return 'randomSwitch('
                .concat(_convertSPARQLQueries2GatlingDSL(dslElement.items, ','))
                .concat('\n)');
        default:
            console.warn("unknown type ".concat(dslElement.type));
            return false;
    }
}