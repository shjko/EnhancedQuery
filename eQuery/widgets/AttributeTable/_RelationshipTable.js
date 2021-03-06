///////////////////////////////////////////////////////////////////////////
// Copyright © 2014 Esri. All Rights Reserved.
//
// Licensed under the Apache License Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//    http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.
///////////////////////////////////////////////////////////////////////////
define([
  'dojo/_base/declare',
  'dojo/_base/html',
  'dijit/_WidgetBase',
  "dgrid/OnDemandGrid",
  "dgrid/Selection",
  "dgrid/extensions/ColumnHider",
  "dgrid/extensions/ColumnResizer",
  "dojo/Deferred",
  'dojo/Evented',
  "dojo/store/Memory",
  "esri/request",
  "esri/tasks/RelationshipQuery",
  'dojo/_base/lang',
  "dojo/on",
  "dojo/_base/array",
  'jimu/dijit/LoadingIndicator',
  './utils'
], function(
  declare,
  html,
  _WidgetBase,
  OnDemandGrid,
  Selection,
  ColumnHider,
  ColumnResizer,
  Deferred,
  Evented,
  Memory,
  esriRequest,
  RelationshipQuery,
  lang,
  on,
  array,
  LoadingIndicator,
  tableUtils
) {
  return declare([_WidgetBase, Evented], {
    baseClass: 'jimu-widget-attributetable-relationship-table',
    _defaultFeatureCount: 2000,
    _defaultBatchCount: 25,
    _batchCount: 0,

    relationship: null,
    parentWidget: null,
    noGridHeight: 0,
    footerHeight: 25,

    loading: null,
    grid: null,
    footer: null,
    selectedRowsLabel: null,
    selectionRows: null,
    nls: null,

    //events:
    //data-loaded
    //row-click
    //clear-selection

    constructor: function(options) {
      options = options || {};
      this.set('relationship', options.relationship || null);
      this.parentWidget = options.parentWidget || null;
      this.noGridHeight = options.noGridHeight || 0;
    },

    postCreate: function() {
      this.selectionRows = [];

      this.loading = new LoadingIndicator();
      this.loading.placeAt(this.domNode);
    },

    startQuery: function(layer, selectedIds) {
      var ship = this.relationship;

      if (ship && !ship.opened && selectedIds && selectedIds.length > 0) {
        this.loading.show();
        var relatedQuery = new RelationshipQuery();
        relatedQuery.objectIds = selectedIds;
        relatedQuery.outFields = ['*'];
        relatedQuery.relationshipId = ship.id;
        relatedQuery.returnGeometry = false;

        // var hasLayerUrl = layer.url &&
        //  this.config.layerInfos[layersIndex].layer.url;
        var hasLayerUrl = layer.url;
        if (hasLayerUrl) {
          var layerUrl = layer.url;
          var parts = layerUrl.split('/');
          parts[parts.length - 1] = ship.relatedTableId;
          var relatedTableUrl = parts.join('/');

          var tableInfoDef = esriRequest({
            url: relatedTableUrl,
            content: {
              f: 'json'
            },
            hangleAs: 'json',
            callbackParamName: 'callback'
          });

          tableInfoDef.then(lang.hitch(this, function(response) {
            if (!this.domNode) {
              return;
            }
            // var _fLayer = this.layers[layersIndex];
            layer.queryRelatedFeatures(
              relatedQuery,
              lang.hitch(this, function(relatedFeatures) {
                if (!this.domNode) {
                  return;
                }
                var results = {
                  displayFieldName: ship.objectIdField,
                  fields: response.fields,
                  features: [],
                  fieldAliases: null
                };

                for (var p in relatedFeatures) {
                  var _set = relatedFeatures[p];
                  if (_set.features && _set.features.length > 0) {
                    results.features = results.features.concat(_set.features);
                  }
                }

                if (results.features.length > 0) {
                  // createRelationTable
                  this.createTable(response, results);

                  this.emit('data-loaded');
                } else {
                  var tip = html.toDom('<div>' + this.nls.noRelatedRecords + '</div>');
                  html.empty(this.domNode);
                  html.place(tip, this.domNode);
                  html.place(this.loading.domNode, this.domNode);
                }

                ship.opened = true;
                // this.refreshGridHeight();
                this.loading.hide();
              }), lang.hitch(this, function(err) {
                console.error(err);
                var tip = html.toDom('<div>' + this.nls.noRelatedRecords + '</div>');
                html.empty(this.domNode);
                html.place(tip, this.domNode);
                html.place(this.loading.domNode, this.domNode);
                this.loading.hide();
              }));
          }), lang.hitch(this, function(err) {
            console.error(err);
            this.loading.hide();
          }));
        }
      } else {
        this.loading.hide();
      }
    },

    getSelectedRows: function() {
      return this.selectionRows;
    },

    zoomTo: function() {
      // this._zoomToSelected();
    },

    showSelectedRecords: function() {
      var oid = this.relationship.objectIdField;
      this.grid._clickShowSelectedRecords = true;
      var ids = this._getSelectedIds();

      if (ids.length > 0 && this.grid) {
        // when refresh completed select these rows.
        this.grid.set('query', lang.hitch(this, function(item) {
          if (typeof item === 'number' && ids.indexOf(item) > -1) {
            return true;
          } else if (ids.indexOf(item[oid]) > -1) {
            return true;
          }
          return false;
        }));
      }
    },

    clearSelection: function() {
      this.grid.clearSelection();
      this.selectionRows = [];
      this.grid.set('query', {});

      this.setSelectedNumber();

      this.emit('clear-selection');
    },

    exportToCSV: function() {
      return this._getExportData()
        .then(lang.hitch(this, function(result) {
          if (!this.domNode) {
            return;
          }
          return tableUtils.createCSVStr(result.data, result.outFields, result.pk, result.types);
        }));
    },

    toggleColumns: function() {
      if (this.grid) {
        this.grid._toggleColumnHiderMenu();
      }
    },

    changeHeight: function(h) {
      if (this.grid && (h - this.noGridHeight - this.footerHeight >= 0)) {
        html.setStyle(
          this.grid.domNode,
          "height", (h - this.noGridHeight - this.footerHeight) + "px"
        );
      }
    },

    destroy: function() {
      this.layerInfo = null;
      this.configedInfo = null;
      this.parentWidget = null;

      if (this.grid) {
        this.grid.destroy();
      }

      this.map = null;
      this.nls = null;

      this.relationship.opened = false;
      this.relationship = null;
      this.inherited(arguments);
    },

    createTable: function(tableInfo, featureSet) {
      var data = array.map(featureSet.features, lang.hitch(this, function(feature) {
        return feature.attributes;
      }));
      var store = tableUtils.generateMemoryStore(data, featureSet.displayFieldName);

      var _typeIdField = tableInfo.typeIdField;
      var _types = tableInfo.types;
      var columns = tableUtils.generateColumnsFromFields(featureSet.fields, _typeIdField, _types);

      if (this.grid) {
        this.grid.set('store', store);
        this.grid.refresh();
      } else {
        var json = {
          'columns': columns,
          'store': store
        };

        this.grid = new(declare(
          [OnDemandGrid, Selection, /*Pagination, */ ColumnHider, ColumnResizer]
        ))(json, html.create("div"));
        html.place(this.grid.domNode, this.domNode);
        this.grid.startup();
        this.grid.__pk = featureSet.displayFieldName;
        this.grid.__outFields = featureSet.fields;

        this.own(on(
          this.grid,
          ".dgrid-row:click",
          lang.hitch(this, this._onRowClick)
        ));
      }

      if (this.footer) {
        html.empty(this.footer);
      } else {
        this.footer = html.create('div', null, this.domNode);
      }
      var _footer = this.footer;
      var countLabel = html.create('div', {
        'class': 'dgrid-status self-footer',
        'innerHTML': data.length + '&nbsp;' + this.nls.features + '&nbsp;'
      }, _footer);
      this.selectedRowsLabel = html.create('div', {
        'class': 'dgrid-status self-footer',
        'innerHTML': 0 + '&nbsp;' + this.nls.selected + '&nbsp;'
      }, countLabel, 'after');

      var height = html.getStyle(this.parentWidget.domNode, "height");
      this.changeHeight(height);
    },

    _getExportData: function() {
      if (!this.relationship) {
        return;
      }
      var def = new Deferred();
      var _outFields = this.grid.__outFields;
      var pk = this.relationship.objectIdField;
      var types = null;
      var data = this.getSelectedRowsData();

      if (data && data.length > 0) {
        def.resolve({
          'data': data,
          'outFields': _outFields,
          'pk': pk,
          'types': types
        });
      } else {
        var store = this.grid.store;
        if (store instanceof Memory) {
          data = store.data;
          def.resolve({
            'data': data,
            'outFields': _outFields,
            'pk': pk,
            'types': types
          });
        } else {
          def.resolve({
            'data': [],
            'outFields': _outFields,
            'pk': pk,
            'types': types
          });
        }
      }

      return def;
    },

    getSelectedRowsData: function() {
      if (!this.grid) {
        return null;
      }

      var oid = this.relationship.objectIdField;
      var store = this.grid.store;
      var data = store._entityData || store.data;
      var selectedIds = this.getSelectedRows();

      var rows = array.map(selectedIds, lang.hitch(this, function(id) {
        for (var i = 0, len = data.length; i < len; i++) {
          if (data[i] && data[i][oid] === id) {
            return data[i];
          }
        }
        return {};
      }));

      return rows || [];
    },

    setSelectedNumber: function() {
      if (this.selectedRowsLabel && this.grid) {
        var _ids = this.getSelectedRows();
        this.selectedRowsLabel.innerHTML = "&nbsp;&nbsp;" +
          _ids.length + " " + this.nls.selected + "&nbsp;&nbsp;";
      }
    },

    _onRowClick: function() {
      this.selectionRows = this._getSelectedIds();
      this.setSelectedNumber();
      this.emit('row-click', {
        table: this,
        selectedIds: lang.clone(this.selectionRows)
      });
    },

    _getSelectedIds: function() {
      var ids = [];
      var selection = this.grid.selection;
      for (var id in selection) {
        if (selection[id]) {
          if (isFinite(id)) {
            ids.push(parseInt(id, 10));
          } else {
            ids.push(id);
          }
        }
      }

      return ids;
    }
  });
});