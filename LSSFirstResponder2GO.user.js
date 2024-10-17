// ==UserScript==
// @name         [LSS]FirstResponder2GO
// @namespace    FirstRespond2GO
// @version      1.0.0
// @description  Speichert eine AAO mit den gewünschten FR Fahrzeugen (AAO ist dann auch in der App nutzbar). Idee von Jan (jxn_30)
// @author       SaibotH
// @license      MIT
// @homepage     https://github.com/SaibotH-LSS/LSSFirstResponder2GO
// @homepageURL  https://github.com/SaibotH-LSS/LSSFirstResponder2GO
// @supportURL   https://github.com/SaibotH-LSS/LSSFirstResponder2GO/issues
// @updateURL    https://raw.githubusercontent.com/SaibotH-LSS/LSSFirstResponder2GO/refs/heads/main/LSSFirstResponder2GO.user.js
// @downloadURL  https://raw.githubusercontent.com/SaibotH-LSS/LSSFirstResponder2GO/refs/heads/main/LSSFirstResponder2GO.user.js
// @icon         https://www.leitstellenspiel.de/favicon.ico
// @match        *.leitstellenspiel.de/aaos/*/edit
// @run-at       document-idle
// ==/UserScript==

// Definition von globalen Variablen um Fehlermeldungen zu unterdrücken
/* global $,I18n */

(async function() {
    'use strict';

    // ######################
    // Funktionsdeklarationen
    // ######################

    // Funktion zum Hinzufügen von Prefixen zum Fahrzeugnamen. Priorität dient dazu gewisse Fahrzeuge z.B. dem Rettungsdienst zuzuweisen anstatt der Feuerwehr da das entsprechende Fahrzeug in beiden Wachen stationiert sein kann.
    function updateCaptionPrefix(vehicle) {
        const buildingMap = [
            { prefix: "Feuer - ", buildings: [0, 18], priority: 6 }, // Feuerwache
            { prefix: "Rettung - ", buildings: [2, 5, 20], priority: 1 }, // Rettungsdienstwache
            { prefix: "Polizei - ", buildings: [6, 11, 13, 17, 19, 24], priority: 5 }, // Polizei
            { prefix: "THW - ", buildings: [9], priority: 4 }, // THW
            { prefix: "SEG - ", buildings: [12, 20], priority: 3 }, // SEG
            { prefix: "Wasser - ", buildings: [15], priority: 2 }, // Wasserrettung
            { prefix: "Berg - ", buildings: [25], priority: 7 }, //
        ];

        const possibleBuildings = vehicle.possibleBuildings;
        const caption = vehicle.caption;

        // Sortiere buildingMap nach Priorität
        const sortedBuildingMap = buildingMap.sort((a, b) => a.priority - b.priority);
        let prefixFound = false; // Flag, um zu überprüfen, ob ein Präfix gefunden wurde

        for (const entry of sortedBuildingMap) {
            if (possibleBuildings.some(building => entry.buildings.includes(building))) {
                // Wenn mindestens ein Gebäude dem aktuellen Präfix entspricht,
                // füge den Präfix zur Caption hinzu
                vehicle.caption = entry.prefix + caption;
                prefixFound = true;
                break; // Da nur ein Präfix hinzugefügt werden soll, brechen wir die Schleife ab.
            };
        };

        // Wenn kein Prefix gefunden wurde wird ZZZ als Prefix genutzt.
        if (!prefixFound) {
            console.error(errorText + `Kein Prefix für Fahrzeug gefunden! Fahrzeugname: ${caption}`);
            vehicle.caption = "ZZZ - " + caption;
        }
    };

    // Holt die Fahrzeugdaten aus der LSSM API ab, verarbeitet diese (Präfix und Fahrzeugnamenliste) und legt diese im local Storage ab.
    async function fetchVehicles(lang) {
        var aTempData = [];
        // Daten werden abgerufen und über try ... catch Fehler abgefangen.
        try {
            aTempData = await $.getJSON("https://api.lss-manager.de/" + lang + "/vehicles"); // Ruft die Daten ab. Wenn ein Error kommt wird der folgende Code nicht mehr bearbeitet.

            // Prefix hinzufügen
            Object.keys(aTempData).forEach(function(key) {
                const vehicle = aTempData[key];
                updateCaptionPrefix(vehicle);
            });

            objVehicles.objData = aTempData

            // Speichert die Fahrzeugnamen in ein Array und Sortiert es
            for (const [vehicleId, vehicleData] of Object.entries(aTempData)) {
                objVehicles.aCaptionList.push(vehicleData.caption);
            }
            objVehicles.aCaptionList.sort((a, b) => a.toUpperCase() > b.toUpperCase() ? 1 : -1);
            objVehicles.timeLastUpdate = now;
            sessionStorage.setItem('frGoVehicles', JSON.stringify(objVehicles));
        } catch(error) {
            if (error.readyState === 0 && error.statusText === "error") {
                console.error(errorText + "Fehler beim Abrufen der LSSM API: Netzwerkfehler oder CORS-Problem");
            } else {
                console.error(errorText, "Sonstiger Fehler beim Abrufen der LSSM API: ", error);
            }
        }
    }

    // Je nach Trigger werden die Namen oder die IDs eines Arrays oder eines Objekts (dataSet) die zu einem anderen Array passen (mapArray) als neues Array (retVal) ausgegeben
    function mapping(dataSet, mapArray, trigger) {
        if (trigger !== "caption" && trigger !== "id") {
            console.error(errorText + "Mapping: Ungültiger Trigger!");
            return [];
        }

        const retVal = [];

        // Überprüfen, ob dataSet ein Array oder ein Objekt ist
        if (Array.isArray(dataSet)) {
            dataSet.forEach(obj => {
                if (trigger === "caption" && mapArray.includes(obj.id)) {
                    retVal.push(obj.caption);
                } else if (trigger === "id" && mapArray.includes(obj.caption)) {
                    retVal.push(obj.id);
                }
            });
        } else if (typeof dataSet === 'object') {
            for (const id in dataSet) {
                const obj = dataSet[id];
                if (trigger === "caption" && mapArray.includes(parseInt(id))) {
                    retVal.push(obj.caption);
                } else if (trigger === "id" && mapArray.includes(obj.caption)) {
                    retVal.push(parseInt(id));
                }
            }
        } else {
            console.error(errorText + "Mapping: Ungültiger DataSet-Typ!");
        }
        return retVal;
    }

    // ###############
    // Initialisierung
    // ###############

    // Definiion Variablen ohne Abhängigkeit
    var lang = I18n.locale;
    var pointless = "Warning: pointless!";
    var elTabContentDiv = document.querySelector('.tab-content')
    var sConfigIds = "";
    var aConfigIds = [];
    var elTabs = document.getElementById('tabs');
    var iConfigQuant = 0;
    var aPosblVehicleTypes = [];
    const strPathname = window.location.pathname;
    const strAaoId = strPathname.match(/\/aaos\/(\d+)\/edit/)[1];
    const now = new Date().getTime();
    const errorText = "## FR2GO ##  ";
    const elSaveButton = document.getElementById('save-button');

    // Auslesen welche AAOs in vehicle_types vom Spiel aus sein können
    elTabContentDiv.querySelectorAll('input').forEach(function(input) {
        const sTempName = input.getAttribute('name');
        if (sTempName.includes('vehicle_type_ids')) {
            aPosblVehicleTypes.push(sTempName.match(/\[(\[?.*?\]?)\]/)[1])
        }
    });

    // AAO Auslesen und ggf. Konfiguration speichern
    const objAao = await $.getJSON('/api/v1/aaos/' + strAaoId)
    if (objAao.vehicle_types) {
        Object.keys(objAao.vehicle_types).forEach(function(value, index) {
            const tempIds = Object.keys(objAao.vehicle_types)[index];
            if (!aPosblVehicleTypes.includes(tempIds)) {
                iConfigQuant = objAao.vehicle_types[value];
                sConfigIds = tempIds.replace(/[\[\]]/g, '')
            }
        });
        aConfigIds = sConfigIds.split(',').map(num => parseInt(num.trim(), 10));
    };

    // AAO Element für den FT2GO
    const elFrGoDivInner = `
        <div class="form-group fake_number optional aao_frgo">
            <div class="col-sm-3 control-label">
                <label class="fake_number optional " for="aao_frgo">First Responder 2Go</label>
            </div>
            <div class="col-sm-9">
                <input class="fake_number optional form-control" id="vehicle_type_frr" type="number" value="${iConfigQuant}">
                <p class="help-block"><b>ACHTUNG:</b> Zum Übernehmen der eingestellten Fahrzeuge muss zuerst die Konfiguration geschrieben und dann die AAO gespeichert werden!</p>
            </div>
            <div class="col-sm-3 control-label">
                <label for="frSelectVehicles">${ lang == "de_DE" ? "Konfiguration FR2Go" : "Configuration FR2GO" }</label>
            </div>
            <div class="col-sm-9">
                <select multiple class="form-control" id="frSelectVehicles" style="height:20em;margin-bottom: 0.5em;"></select>
                <p class="help-block">${ lang == "de_DE" ? "Mehrfachauswahl mit Strg + Klick." : "multiple-choice with Strg + click." }</p>
                <a href="#" style="margin: 7px;" aria-role="button" class="btn btn-primary btn-group pull-left" id="btnfrToGoSave">
                    <span aria-hidden="true">Schreibe FR 2Go Konfig</span>
                </a>
                <a href="#" style="margin: 7px;" aria-role="button" class="btn btn-danger pull-left ml-2" id="btnfrToGoDeleteOther">
                    <span style="margin-right: 2px;" class="glyphicon glyphicon-trash"></span>
                    <span aria-hidden="true">Leeren der restlichen AAO</span>
                </a>
            </div>
        </div>
    `;

    // Fahrzeugdaten aus dem Session Storage holen falls vorhanden
    var objVehicles = JSON.parse(sessionStorage.getItem('frGoVehicles'));
    if (!objVehicles){
        objVehicles = { objData: {}, aCaptionList: [], timeLastUpdate: 0 }
        await fetchVehicles(lang);
        console.log(errorText, "sessionStorage war leer. Daten wurden abgerufen und gespeichert.");
    } else if(objVehicles.timeLastUpdate < (now - 24 * 60 * 60 * 1000)) {
        await fetchVehicles(lang)
        console.log(errorText, "Daten im sessionStorage waren veraltet. Daten wurden abgerufen und gespeichert.");
    } else console.log(errorText, "Fahrzeuge waren schon im sessionStorage");

    // ###################################################
    // Hier wird die Magie des First Responder 2Go gemacht
    // ###################################################

    // FR 2Go Tab erstellen
    elTabs.insertAdjacentHTML('beforeend', `
        <li role="presentation">
            <a href="#frgo_config" aria-controls="vehicle_type_captions" role="tab" data-toggle="tab">First Responder 2Go</a>
        </li>
    `);

    // Neues FR 2Go Input Element erstellen
    var elFrGoDiv = document.createElement('div');
    elFrGoDiv.setAttribute('role', 'tabpanel');
    elFrGoDiv.className = 'tab-pane';
    elFrGoDiv.id = 'frgo_config';
    elFrGoDiv.innerHTML = elFrGoDivInner;
    elTabContentDiv.appendChild(elFrGoDiv)

    // FrGO Input holen und ggf. beschreiben/aktualisieren
    var elInput = document.getElementById('vehicle_type_frr')
    if (sConfigIds !== "") {
        elInput.setAttribute('name', `vehicle_type_ids[[${sConfigIds}]]`);
    }
    elInput.addEventListener("input", function() {
        elInput.setAttribute('value', `${elInput.value}`);
    });

    // Fügt Optionen in der Fahrzeugauswahl hinzu (Aus Array mit Fahrzeugnamen)
    for (const i in objVehicles.aCaptionList) {
        $("#frSelectVehicles").append(`<option>${ objVehicles.aCaptionList[i] }</option>`);
    }

    // Wählt die Fahrzeuge und Leitstellen an die zuvor gespeichert wurden
    $("#frSelectVehicles").val(mapping(objVehicles.objData, aConfigIds, "caption"));

    // Holen der Buttons
    var btnSave = document.getElementById('btnfrToGoSave');
    var btnDeleteOther = document.getElementById('btnfrToGoDeleteOther');

    // Alle anderen AAO Einträge löschen
    btnDeleteOther.addEventListener('click', function(event) {
        event.preventDefault();
        // Benutzer abfragen ob wirklich alles gelöscht werden soll.
        const fUserConfirmed = confirm('Möchten sie wirklich alle anderen Fahrzeugeinstellungen löschen?');
        if (fUserConfirmed) {
            // Alle anderen inputs auf 0 setzen
            elTabContentDiv.querySelectorAll('input').forEach(function(input) {
                if (input.id !== "vehicle_type_frr") {
                    input.value = '0';
                    input.setAttribute('value', '0');
                }
            });
        }
    });

    // Speichern der Fr2Go Konfig in das input Element mittels Button Klick
    btnSave.addEventListener('click', function(event) {
        event.preventDefault();
        aConfigIds = $("#frSelectVehicles").val() ? mapping(objVehicles.objData, $("#frSelectVehicles").val(), "id") : [];
        sConfigIds = aConfigIds.join(', ');
        if (sConfigIds !== "") {
            elInput.setAttribute('name', `vehicle_type_ids[[${sConfigIds}]]`);
            if (elInput.value === '0') {
                elInput.setAttribute('value', '1');
                elInput.value = '1';
            }
        } else {
            elInput.removeAttribute('name');
            elInput.setAttribute('value', '0');
            elInput.value = '0';
        }
    });

})();
