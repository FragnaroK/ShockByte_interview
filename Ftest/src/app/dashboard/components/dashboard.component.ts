import { Component, OnInit } from '@angular/core';
import { NodeService } from 'src/app/core/services/node.service';
import { Node } from 'src/app/core/models/node/node.model';
import { EMPTY, empty, interval, of, Subscription, timer } from 'rxjs';
import {
  catchError,
  repeat,
  retry,
  startWith,
  switchMap,
} from 'rxjs/operators';
import * as moment from 'moment';
import * as lodash from 'lodash';

@Component({
  selector: 'app-dashboard',
  templateUrl: './dashboard.component.html',
  styleUrls: ['./dashboard.component.scss'],
})
export class DashboardComponent implements OnInit {
  // Intervals to start "Polling" and maintain the dashboard updated every 5 minutes
  initInterval!: Subscription; // Interval executed in Init to fetch all the pages availables, when finish, it will unsubscribe and not work anymore
  updDataInterval!: Subscription; // Interval executed after "initInterval" to update data every 5 minutes

  // Var
  nodes: any[] = [];
  totalNodes: number = 0;
  newNodes: number = 0;
  lastNode: string = '';

  dateRange = {
    start: moment().local().format('yyyy-MM-DDTHH:mm:ss.SSS').toString(),
    end: moment()
      .local()
      .subtract(1, 'days')
      .format('yyyy-MM-DDTHH:mm:ss.SSS')
      .toString(),
  };

  constructor(private nodes_api: NodeService) {
    this.fetchNodes();
  }

  ngOnInit(): void {
    this.checkErrors();
  }

  fetchNodes() {
    /* Initialize data */
    var page = 0; // Just a count to check different pages
    this.initInterval = timer(0, 1000) // It sends a request every 1s until return a page with less nodes than the limit, which is 20 per page
      .pipe(
        switchMap(() => this.nodes_api.getNodes(page + 1)),
        retry(3) // if there is an error, retry at least 3 times
      )
      .pipe(repeat(3))
      .subscribe(
        (nodes) => {
          nodes.length === 0 // If the response doesn't have any nodes, then reasign "page" with 0 to restart the counting and unsubscribe to stop this interval
            ? ((page = 0), this.initInterval.unsubscribe())
            : nodes.length < 20 // But, if it have nodes inside, check if it is the only or last page.
            ? (this.nodes.push(nodes), this.initInterval.unsubscribe()) // If  there are less nodes than the limit, save these nodes and unsubscribe to stop the interval;
            : this.nodes.push(nodes); // And finishing, if all is okay and there are the limit of nodes, save them
          this.totalNodes += nodes.length; // Count Nodes in every call
          this.afterFetch(nodes); // check en every call the most recents nodes
          //- it is not really necesary, because the list comes sorted by date, but in case that the request change then it will get the new nodes anyway
          this.lastNode = this.getLastNode(this.nodes);
          page++;
        },
        (err) => {
          this.checkErrors();
          console.log(
            new Error('dashboard.component - Error initInterval: '),
            err
          );
          console.error(
            new Error('there was a problem during fetcg with initInterval')
          );
        }
      );
    /* update Data */
    var updPages = 0;
    this.updDataInterval = timer(100000, 300000) // the only difference: It starts After the initInterval and execute every 5 minutes (time in ms)
      .pipe(
        switchMap(() => this.nodes_api.getNodes(updPages + 1)),
        retry(5)
      )
      .pipe(repeat(3))
      .subscribe(
        (nodes) => {
          page === updPages // If this page doesn't have any node, then reasign "pages" to start again
            ? (updPages = 0)
            : null;
          this.checkChanges(this.nodes[updPages], nodes) // but if it have, then check if the pages are equals or there is any change
            ? (this.nodes[updPages] = [...nodes]) // If there is any change, save the requested page
            : null;
          this.afterFetch(nodes); // get new nodes
          this.lastNode = this.getLastNode(this.nodes);
          updPages++; // next request to the next page
          page === updPages // If this page doesn't have any node, then reasign "pages" to start again
            ? (updPages = 0)
            : null;
          console.log('sigue');
        },
        (err) => {
          this.checkErrors();
          console.log(
            new Error('dashboard.component - Error updInterval: '),
            err
          );
          console.error(
            new Error('there was a problem during fetcg with updInterval')
          );
        }
      );
  }

  afterFetch(nodes: Node[]) {
    // Count new Nodes:
    //"If this node is new (last 24h), then add 1 to NewNodes. But if not, don't do anything"
    nodes.forEach((node: Node) => {
      moment(this.nodesDateFormat(node.up_since)).isAfter(this.dateRange.end) // format date string and check if this date is less than a day ago
        ? this.newNodes++ // if it is, save it
        : null;
    });

    // save the last new node into lastNode
  }
  getLastNode(nodes: any[]): string {
    let newNodes: Node[] = [];
    let lastNode: Node[] = [];

    nodes.forEach((page: Node[]) => {
      page.forEach((node: Node) => {
        newNodes.push(node);
      });
    });
    this.totalNodes = newNodes.length;
    lastNode = lodash.orderBy(
      newNodes,
      (node) => moment(node.up_since).format('YYYYMMDD'),
      'desc'
    );
    return lastNode
      ? moment(lastNode[0].up_since).format('ddd, MMM DD')
      : 'Not Found';
  }

  checkChanges(prevNodes: Node[], comingNodes: Node[]): boolean {
    let changes = false;
    // check differences between two arrays
    if (comingNodes.length !== 0) {
      prevNodes.forEach((node) => {
        // check each node in the original array, if someone is different, return true;
        comingNodes.some((n) => n === node) ? (changes = true) : null;
      });
    }
    return changes ? true : false; // there are changes? yes or no;
  }
  nodesDateFormat(date: string): string {
    // change date format
    return moment(date).utc().format('yyyy-MM-DDTHH:mm:ss.SSS').toString();
  }
  checkErrors() {
    const errorCheck = setInterval(() => {
      // Error notifications - console
      console.group('dashboard.component.ts');
      this.nodes.length === 0
        ? console.error(new Error("Nodes doesn't have anything"), this.nodes)
        : clearInterval(errorCheck);
      this.totalNodes === 0
        ? console.warn('totalNodes equal to 0', this.totalNodes)
        : clearInterval(errorCheck);
      this.lastNode === ''
        ? console.error(
            new Error("Last node doesn't contain a date"),
            this.lastNode
          )
        : clearInterval(errorCheck);
      console.groupEnd();
    }, 5000);
  }
}
