//+------------------------------------------------------------------+
//| DataExporter.mq5 — Exports account info and trade history to JSON |
//| files in MQL5/Files/ for the bridge server to read.               |
//+------------------------------------------------------------------+
#property copyright "MT5 Demo Stats"
#property version   "1.00"
#property strict

#define TIMER_SECONDS 30
#define STATUS_FILE   "status.json"
#define ACCOUNT_FILE  "account_info.json"
#define TRADES_FILE   "trades.json"

//+------------------------------------------------------------------+
//| Helper: escape a string for JSON output                          |
//+------------------------------------------------------------------+
string JsonEscape(string s) {
   string result = s;
   StringReplace(result, "\\", "\\\\");
   StringReplace(result, "\"", "\\\"");
   StringReplace(result, "\n", "\\n");
   StringReplace(result, "\r", "\\r");
   StringReplace(result, "\t", "\\t");
   return result;
}

//+------------------------------------------------------------------+
//| Helper: format datetime as YYYY-MM-DD HH:MM:SS                  |
//+------------------------------------------------------------------+
string FormatDateTime(datetime t) {
   MqlDateTime dt;
   TimeToStruct(t, dt);
   return StringFormat("%04d-%02d-%02d %02d:%02d:%02d",
                       dt.year, dt.mon, dt.day, dt.hour, dt.min, dt.sec);
}

//+------------------------------------------------------------------+
//| Write status.json                                                |
//+------------------------------------------------------------------+
void WriteStatus() {
   int handle = FileOpen(STATUS_FILE, FILE_WRITE | FILE_TXT | FILE_ANSI);
   if(handle == INVALID_HANDLE) return;

   string json = StringFormat(
      "{\"status\":\"ok\",\"login\":%d,\"last_update\":\"%s\"}",
      AccountInfoInteger(ACCOUNT_LOGIN),
      FormatDateTime(TimeCurrent())
   );
   FileWriteString(handle, json);
   FileClose(handle);
}

//+------------------------------------------------------------------+
//| Write account_info.json                                          |
//+------------------------------------------------------------------+
void WriteAccountInfo() {
   int handle = FileOpen(ACCOUNT_FILE, FILE_WRITE | FILE_TXT | FILE_ANSI);
   if(handle == INVALID_HANDLE) return;

   string json = StringFormat(
      "{\"login\":%d,\"server\":\"%s\",\"balance\":%.2f,\"equity\":%.2f,"
      "\"margin\":%.2f,\"free_margin\":%.2f,\"leverage\":%d,"
      "\"currency\":\"%s\",\"name\":\"%s\"}",
      AccountInfoInteger(ACCOUNT_LOGIN),
      JsonEscape(AccountInfoString(ACCOUNT_SERVER)),
      AccountInfoDouble(ACCOUNT_BALANCE),
      AccountInfoDouble(ACCOUNT_EQUITY),
      AccountInfoDouble(ACCOUNT_MARGIN),
      AccountInfoDouble(ACCOUNT_MARGIN_FREE),
      AccountInfoInteger(ACCOUNT_LEVERAGE),
      JsonEscape(AccountInfoString(ACCOUNT_CURRENCY)),
      JsonEscape(AccountInfoString(ACCOUNT_NAME))
   );
   FileWriteString(handle, json);
   FileClose(handle);
}

//+------------------------------------------------------------------+
//| Write trades.json — paired entry/exit deals                      |
//+------------------------------------------------------------------+
void WriteTrades() {
   // Select full history
   if(!HistorySelect(0, TimeCurrent())) return;

   int total = HistoryDealsTotal();

   // First pass: collect entry deals keyed by position_id
   // MQL5 doesn't have a dictionary, so use parallel arrays
   long   entry_pos_ids[];
   long   entry_tickets[];
   int    entry_types[];
   double entry_prices[];
   datetime entry_times[];
   int entry_count = 0;

   for(int i = 0; i < total; i++) {
      ulong ticket = HistoryDealGetTicket(i);
      if(ticket == 0) continue;

      long entry = HistoryDealGetInteger(ticket, DEAL_ENTRY);
      if(entry == DEAL_ENTRY_IN) {
         int idx = entry_count;
         entry_count++;
         ArrayResize(entry_pos_ids, entry_count);
         ArrayResize(entry_tickets, entry_count);
         ArrayResize(entry_types, entry_count);
         ArrayResize(entry_prices, entry_count);
         ArrayResize(entry_times, entry_count);

         entry_pos_ids[idx] = HistoryDealGetInteger(ticket, DEAL_POSITION_ID);
         entry_tickets[idx] = (long)ticket;
         entry_types[idx]   = (int)HistoryDealGetInteger(ticket, DEAL_TYPE);
         entry_prices[idx]  = HistoryDealGetDouble(ticket, DEAL_PRICE);
         entry_times[idx]   = (datetime)HistoryDealGetInteger(ticket, DEAL_TIME);
      }
   }

   // Second pass: match exit deals with entries, build JSON
   string trades_json = "[";
   bool first = true;

   for(int i = 0; i < total; i++) {
      ulong ticket = HistoryDealGetTicket(i);
      if(ticket == 0) continue;

      long entry = HistoryDealGetInteger(ticket, DEAL_ENTRY);
      if(entry != DEAL_ENTRY_OUT) continue;

      long pos_id = HistoryDealGetInteger(ticket, DEAL_POSITION_ID);

      // Find matching entry
      int entry_idx = -1;
      for(int j = 0; j < entry_count; j++) {
         if(entry_pos_ids[j] == pos_id) {
            entry_idx = j;
            break;
         }
      }

      // Determine direction from entry deal type
      string direction = "sell";
      if(entry_idx >= 0) {
         // DEAL_TYPE_BUY = 0 means the entry was a buy
         direction = (entry_types[entry_idx] == DEAL_TYPE_BUY) ? "buy" : "sell";
      } else {
         // No entry found — infer from exit (exit buy closes a sell, exit sell closes a buy)
         int deal_type = (int)HistoryDealGetInteger(ticket, DEAL_TYPE);
         direction = (deal_type == DEAL_TYPE_BUY) ? "sell" : "buy";
      }

      double open_price  = (entry_idx >= 0) ? entry_prices[entry_idx] : 0.0;
      string open_time   = (entry_idx >= 0) ? FormatDateTime(entry_times[entry_idx]) : "";
      double close_price = HistoryDealGetDouble(ticket, DEAL_PRICE);
      string close_time  = FormatDateTime((datetime)HistoryDealGetInteger(ticket, DEAL_TIME));
      double volume      = HistoryDealGetDouble(ticket, DEAL_VOLUME);
      double profit      = HistoryDealGetDouble(ticket, DEAL_PROFIT);
      double swap        = HistoryDealGetDouble(ticket, DEAL_SWAP);
      double commission  = HistoryDealGetDouble(ticket, DEAL_COMMISSION);
      string comment     = HistoryDealGetString(ticket, DEAL_COMMENT);
      long   magic       = HistoryDealGetInteger(ticket, DEAL_MAGIC);
      string symbol      = HistoryDealGetString(ticket, DEAL_SYMBOL);

      if(!first) trades_json += ",";
      first = false;

      trades_json += StringFormat(
         "{\"ticket\":%d,\"symbol\":\"%s\",\"direction\":\"%s\","
         "\"volume\":%.2f,\"open_price\":%.5f,\"close_price\":%.5f,"
         "\"open_time\":\"%s\",\"close_time\":\"%s\","
         "\"profit\":%.2f,\"swap\":%.2f,\"commission\":%.2f,"
         "\"comment\":\"%s\",\"magic\":%d}",
         (long)ticket,
         JsonEscape(symbol),
         direction,
         volume,
         open_price,
         close_price,
         open_time,
         close_time,
         profit,
         swap,
         commission,
         JsonEscape(comment),
         magic
      );
   }

   trades_json += "]";

   int handle = FileOpen(TRADES_FILE, FILE_WRITE | FILE_TXT | FILE_ANSI);
   if(handle == INVALID_HANDLE) return;
   FileWriteString(handle, trades_json);
   FileClose(handle);
}

//+------------------------------------------------------------------+
//| Export all data                                                   |
//+------------------------------------------------------------------+
void ExportAll() {
   // Only export if connected to a trade server
   if(!TerminalInfoInteger(TERMINAL_CONNECTED)) return;

   WriteAccountInfo();
   WriteTrades();
   WriteStatus();
   Print("DataExporter: data exported at ", TimeToString(TimeCurrent()));
}

//+------------------------------------------------------------------+
//| Expert initialization                                            |
//+------------------------------------------------------------------+
int OnInit() {
   EventSetTimer(TIMER_SECONDS);
   Print("DataExporter EA initialized, timer set to ", TIMER_SECONDS, "s");
   // Try initial export (may fail if not connected yet)
   ExportAll();
   return INIT_SUCCEEDED;
}

//+------------------------------------------------------------------+
//| Expert deinitialization                                          |
//+------------------------------------------------------------------+
void OnDeinit(const int reason) {
   EventKillTimer();
   Print("DataExporter EA deinitialized, reason: ", reason);
}

//+------------------------------------------------------------------+
//| Timer event — periodic re-export                                 |
//+------------------------------------------------------------------+
void OnTimer() {
   ExportAll();
}

//+------------------------------------------------------------------+
//| Trade event — immediate re-export when trades change             |
//+------------------------------------------------------------------+
void OnTrade() {
   ExportAll();
}

//+------------------------------------------------------------------+
//| Tick event — not used, but required for EA to be valid           |
//+------------------------------------------------------------------+
void OnTick() {
   // Data export handled by OnTimer and OnTrade
}