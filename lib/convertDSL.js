var _ = require('lodash');


function prepareDSL(queries, uriSets, limit) {
    uriSets = _.clone(uriSets);
    return _.map(queries, function (query) {
        query.queryTemplate = query.query.replace(/\n/gi, '');
        var variables = _.uniq(query.queryTemplate.match(/\$\w+/gi));

        if (_.contains(variables, '$limit')) {
            variables = _.without(_.clone(variables), '$limit', '$offset');
            var limitSet = buildLimitQuery(query, _.clone(variables), limit);
            return buildQuery(limitSet, variables, {});
        } else {
            return buildQuery(query, variables, {});
        }

    });


    function buildQuery(query, variables, boundVariables) {

        if (variables.length > 0) {
            var currentVariable = variables.pop().replace(/\W/gi, '');
            var randomSwitch = _.map(uriSets[currentVariable], function (x) {
                boundVariables['$' + currentVariable] = x.uri;
                var items = buildQuery(query, _.clone(variables), boundVariables);
                return {
                    type: 'randomSwitchElement',
                    name: x.uri,
                    weight: x.weight + '',
                    items: _.flatten([items])
                }
            });
            return {name: currentVariable, type: 'randomSwitch', items: randomSwitch};
        }
        if (_.isArray(query.queryTemplate)) {
            return _.map(query.queryTemplate, function (t) {
                return {

                    name: query.name.concat(': ').concat(t.name), type: 'query',
                    query: _.template(t.query)(boundVariables)
                }
            });
        }
        return [{name: query.name, type: 'query', query: _.template(query.queryTemplate)(boundVariables)}];
    }

    function buildLimitQuery(query, variables, limit) {

        var boundVariables = {};

        _.forEach(variables, function (v) {
            boundVariables[v] = '<%= ' + v + ' %>';
        });

        var queryTemplate = _.template(query.queryTemplate);

        query.queryTemplate = [];

        _.forEach(limit.steps, function (offset) {
            var current = 0;
            while (current < limit.totalItems) {
                query.queryTemplate.push({
                        name: offset + '|' + current,
                        query:
                            queryTemplate(_.extend(boundVariables, {
                                $offset: current,
                                $limit: offset
                            }))
                    }
                );
                current += offset;
            }
        });

        return query;

    }

}

module.exports = prepareDSL;