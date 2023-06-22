![Logo](admin/intex.png)
# ioBroker.intex

[![NPM version](https://img.shields.io/npm/v/iobroker.intex.svg)](https://www.npmjs.com/package/iobroker.intex)
[![Downloads](https://img.shields.io/npm/dm/iobroker.intex.svg)](https://www.npmjs.com/package/iobroker.intex)
![Number of Installations](https://iobroker.live/badges/intex-installed.svg)
![Current version in stable repository](https://iobroker.live/badges/intex-stable.svg)
[![Dependency Status](https://img.shields.io/david/TA2k/iobroker.intex.svg)](https://david-dm.org/TA2k/iobroker.intex)


**Tests:** ![Test and Release](https://github.com/TA2k/ioBroker.intex/workflows/Test%20and%20Release/badge.svg)

## intex adapter for ioBroker

Adapter for Intex Whirlpool with wifi modul

## Die Strategie, wie man mit dem Pool und der Cloud kommunizieren kann

### Über Cloud

#### Cloud sekundär; Pool lokal, falls vorhanden

Bei diesem Modus versucht das System den Steuerbefehl und Updatebefehl lokal abzusetzen. Sollte ein Fehler bei der lokalen Kommunikation auftreten, wechselt das System in den Cloudbetrieb bis zum nächsten Start des Adapters.

IP-Adresse und Port kommen aus der Cloud. Sollte sie IP-Adresse fach sein, muss der Pool in der App neu angemeldet werden. Verbindungstaste lang drücken und den Pool suchen. Ein Löschen aus der App ist normalerweise nicht nötig.

#### Cloud sekundär; Pool nur lokal

Bei diesem Modus setzet das System den Steuerbefehl und Updatebefehl lokal ab. Sollte ein Fehler bei der lokalen Kommunikation auftreten, wechselt das System nicht in den Cloudbetrieb.

Das Intervall kann hier auf 0.5 Minute gesetzt werden.

IP-Adresse und Port kommen aus der Cloud. Sollte sie IP-Adresse fach sein, muss der Pool in der App neu angemeldet werden. Verbindungstaste lang drücken und den Pool suchen. Ein Löschen aus der App ist normalerweise nicht nötig.

#### Nur Cloud

Bei diesem Modus setzet das System den Steuerbefehl und Updatebefehl nur über die Cloud ab.


##### Loginablauf:

Die Intex App Mail und Passwort eingeben.

### Lokal

#### Nur lokal

Im lokalen Betrieb werden aktuell auch Funktionen angeboten, die der Pool nicht unterstützt. Hier mus unter Adresse entweder der DNS-Name des Pools beim Router oder die IP-Adresse des Pools angegeben werden.

Das Intervall kann hier ebenfalls auf 0.5 Minute gesetzt werden.

Die IP-Adresse des Pools kann über den Suchbutton gesucht werden. Dieses kann allerdings von Router Unterbundnen werden, wenn z. B. WLAN Geräte nicht untereinander kommunizieren dürfen oder in der lokalen Firewall des Rechners Ports oder Bordcasting gesperrt ist.

## Steuern

intex.0.<id>.remote auf true setzen steuert den jeweiligen Befehl.

intex.0.<id>.control auf true oder false setzen, steuert den Pool Befehl in den Zustand.



## Diskussion und Fragen:
https://forum.iobroker.net/topic/47932/test-intext-app-v0-0-x

## Changelog

### 0.1.0
* (PLCHome/rbartl) Unterstützung lokale IP. Sowohl über Cloud als auch nur lokal ohne Cloud. Danke nach Österreich an Robert Bartl.
* (PLCHome) Nach dem Schalten über Control direkt bestätigen.

### 0.0.7
* (PLCHome) Schalten über remote funktioniert wieder.
* (PLCHome) Nach dem Schalten über Control kann von der Cloud der vorherige Staus übermittelt werden. Dadurch kann es zu einem Toggeln des Zutands kommen.

### 0.0.6
* (PLCHome) Definiertes Setzen von Zuständen
* (PLCHome) Ändern Fahrenheit Celsius
* (PLCHome) control.temperatur, nur lesen, Objekt aus 0.0.5 muss einmal gelöscht werden.

### 0.0.5
* (PLCHome) Temperatur setzen hinzugefügt, Objekt muss einmal gelöscht werden.
* (PLCHome) Decodierung der Statusinformationen

### 0.0.1
* (TA2k) initial release

## License
MIT License

Copyright (c) 2021 - 2023 TA2k <tombox2020@gmail.com>

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
