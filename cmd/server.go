package main

import (
	"bufio"
	"encoding/json"
	"flag"
	"fmt"
	"io"
	"log"
	"net"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"sync"

	"github.com/google/go-dap"
)

var cmd *exec.Cmd

func main() {
	f, _ := os.OpenFile(filepath.Join(filepath.Dir(os.Args[0]), "log"), os.O_RDWR|os.O_CREATE, 0644)
	log.SetOutput(f)
	log.Println("started")

	port := flag.String("port", "", "TCP port to listen on")
	flag.Parse()
	if *port == "" {
		launched()
	} else {
		err := server(*port)
		if err != nil {
			log.Fatal("Could not start server: ", err)
		}
	}
}

func launched() {
	conn := NewLocalConn(os.Stdin, os.Stdout)
	handleConnection(conn)
}

// server starts a server that listens on a specified port
// and blocks indefinitely. This server can accept multiple
// client connections at the same time.
func server(port string) error {
	listener, err := net.Listen("tcp", ":"+port)
	if err != nil {
		return err
	}
	defer listener.Close()
	log.Println("Started server at", listener.Addr())

	for {
		conn, err := listener.Accept()
		if err != nil {
			log.Println("Connection failed:", err)
			continue
		}
		log.Println("Accepted connection from", conn.RemoteAddr())
		// Handle multiple client connections concurrently
		go handleConnection(conn)
	}
}

func handleConnection(conn net.Conn) {
	debugSession := fakeDebugSession{
		rw:        bufio.NewReadWriter(bufio.NewReader(conn), bufio.NewWriter(conn)),
		sendQueue: make(chan dap.Message),
		stopDebug: make(chan struct{}),
	}
	go debugSession.sendFromQueue()

	for {
		err := debugSession.handleRequest()
		if err != nil {
			if err == io.EOF {
				log.Println("No more data to read:", err)
				break
			}
			// There maybe more messages to process, but
			// we will start with the strict behavior of only accepting
			// expected inputs.
			log.Fatal("Server error: ", err)
		}
	}

	log.Println("Closing connection from", conn.RemoteAddr())
	close(debugSession.stopDebug)
	debugSession.sendWg.Wait()
	close(debugSession.sendQueue)
	conn.Close()
}

func (ds *fakeDebugSession) handleRequest() error {
	log.Println("Reading request...")
	request, err := dap.ReadProtocolMessage(ds.rw.Reader)
	if err != nil {
		return err
	}
	log.Printf("Received request\n\t%#v\n", request)
	ds.sendWg.Add(1)
	go func() {
		ds.dispatchRequest(request)
		ds.sendWg.Done()
	}()
	return nil
}

// dispatchRequest launches a new goroutine to process each request
// and send back events and responses.
func (ds *fakeDebugSession) dispatchRequest(request dap.Message) {
	switch request := request.(type) {
	case *dap.InitializeRequest:
		ds.onInitializeRequest(request)
	case *dap.LaunchRequest:
		ds.onLaunchRequest(request)
	case *dap.AttachRequest:
		ds.onAttachRequest(request)
	case *dap.DisconnectRequest:
		ds.onDisconnectRequest(request)
	case *dap.TerminateRequest:
		ds.onTerminateRequest(request)
	case *dap.RestartRequest:
		ds.onRestartRequest(request)
	case *dap.SetBreakpointsRequest:
		ds.onSetBreakpointsRequest(request)
	case *dap.SetFunctionBreakpointsRequest:
		ds.onSetFunctionBreakpointsRequest(request)
	case *dap.SetExceptionBreakpointsRequest:
		ds.onSetExceptionBreakpointsRequest(request)
	case *dap.ConfigurationDoneRequest:
		ds.onConfigurationDoneRequest(request)
	case *dap.ContinueRequest:
		ds.onContinueRequest(request)
	case *dap.NextRequest:
		ds.onNextRequest(request)
	case *dap.StepInRequest:
		ds.onStepInRequest(request)
	case *dap.StepOutRequest:
		ds.onStepOutRequest(request)
	case *dap.StepBackRequest:
		ds.onStepBackRequest(request)
	case *dap.ReverseContinueRequest:
		ds.onReverseContinueRequest(request)
	case *dap.RestartFrameRequest:
		ds.onRestartFrameRequest(request)
	case *dap.GotoRequest:
		ds.onGotoRequest(request)
	case *dap.PauseRequest:
		ds.onPauseRequest(request)
	case *dap.StackTraceRequest:
		ds.onStackTraceRequest(request)
	case *dap.ScopesRequest:
		ds.onScopesRequest(request)
	case *dap.VariablesRequest:
		ds.onVariablesRequest(request)
	case *dap.SetVariableRequest:
		ds.onSetVariableRequest(request)
	case *dap.SetExpressionRequest:
		ds.onSetExpressionRequest(request)
	case *dap.SourceRequest:
		ds.onSourceRequest(request)
	case *dap.ThreadsRequest:
		ds.onThreadsRequest(request)
	case *dap.TerminateThreadsRequest:
		ds.onTerminateThreadsRequest(request)
	case *dap.EvaluateRequest:
		ds.onEvaluateRequest(request)
	case *dap.StepInTargetsRequest:
		ds.onStepInTargetsRequest(request)
	case *dap.GotoTargetsRequest:
		ds.onGotoTargetsRequest(request)
	case *dap.CompletionsRequest:
		ds.onCompletionsRequest(request)
	case *dap.ExceptionInfoRequest:
		ds.onExceptionInfoRequest(request)
	case *dap.LoadedSourcesRequest:
		ds.onLoadedSourcesRequest(request)
	case *dap.DataBreakpointInfoRequest:
		ds.onDataBreakpointInfoRequest(request)
	case *dap.SetDataBreakpointsRequest:
		ds.onSetDataBreakpointsRequest(request)
	case *dap.ReadMemoryRequest:
		ds.onReadMemoryRequest(request)
	case *dap.DisassembleRequest:
		ds.onDisassembleRequest(request)
	case *dap.CancelRequest:
		ds.onCancelRequest(request)
	case *dap.BreakpointLocationsRequest:
		ds.onBreakpointLocationsRequest(request)
	default:
		log.Fatalf("Unable to process %#v", request)
	}
}

// send lets the sender goroutine know via a channel that there is
// a message to be sent to client. This is called by per-request
// goroutines to send events and responses for each request and
// to notify of events triggered by the fake debugger.
func (ds *fakeDebugSession) send(message dap.Message) {
	ds.sendQueue <- message
}

// sendFromQueue is to be run in a separate goroutine to listen on a
// channel for messages to send back to the client. It will
// return once the channel is closed.
func (ds *fakeDebugSession) sendFromQueue() {
	for message := range ds.sendQueue {
		dap.WriteProtocolMessage(ds.rw.Writer, message)
		log.Printf("Message sent\n\t%#v\n", message)
		ds.rw.Flush()
	}
}

// -----------------------------------------------------------------------
// Very Fake Debugger
//

// The debugging session will keep track of how many breakpoints
// have been set. Once start-up is done (i.e. configurationDone
// request is processed), it will "stop" at each breakpoint one by
// one, and once there are no more, it will trigger a terminated event.
type fakeDebugSession struct {
	// rw is used to read requests and write events/responses
	rw *bufio.ReadWriter

	// sendQueue is used to capture messages from multiple request
	// processing goroutines while writing them to the client connection
	// from a single goroutine via sendFromQueue. We must keep track of
	// the multiple channel senders with a wait group to make sure we do
	// not close this channel prematurely. Closing this channel will signal
	// the sendFromQueue goroutine that it can exit.
	sendQueue chan dap.Message
	sendWg    sync.WaitGroup

	// stopDebug is used to notify long-running handlers to stop processing.
	stopDebug chan struct{}
}

// -----------------------------------------------------------------------
// Request Handlers
//
// Below is a dummy implementation of the request handlers.
// They take no action, but just return dummy responses.
// A real debug adaptor would call the debugger methods here
// and use their results to populate each response.

func (ds *fakeDebugSession) onInitializeRequest(request *dap.InitializeRequest) {
	response := &dap.InitializeResponse{}
	response.Response = *newResponse(request.Seq, request.Command)
	response.Body.SupportsConfigurationDoneRequest = false
	response.Body.SupportsFunctionBreakpoints = false
	response.Body.SupportsConditionalBreakpoints = false
	response.Body.SupportsHitConditionalBreakpoints = false
	response.Body.SupportsEvaluateForHovers = false
	response.Body.ExceptionBreakpointFilters = []dap.ExceptionBreakpointsFilter{}
	response.Body.SupportsStepBack = false
	response.Body.SupportsSetVariable = false
	response.Body.SupportsRestartFrame = false
	response.Body.SupportsGotoTargetsRequest = false
	response.Body.SupportsStepInTargetsRequest = false
	response.Body.SupportsCompletionsRequest = false
	response.Body.CompletionTriggerCharacters = []string{}
	response.Body.SupportsModulesRequest = false
	response.Body.AdditionalModuleColumns = []dap.ColumnDescriptor{}
	response.Body.SupportedChecksumAlgorithms = []dap.ChecksumAlgorithm{}
	response.Body.SupportsRestartRequest = false
	response.Body.SupportsExceptionOptions = false
	response.Body.SupportsValueFormattingOptions = false
	response.Body.SupportsExceptionInfoRequest = false
	response.Body.SupportTerminateDebuggee = false
	response.Body.SupportsDelayedStackTraceLoading = false
	response.Body.SupportsLoadedSourcesRequest = false
	response.Body.SupportsLogPoints = false
	response.Body.SupportsTerminateThreadsRequest = false
	response.Body.SupportsSetExpression = false
	response.Body.SupportsTerminateRequest = false
	response.Body.SupportsDataBreakpoints = false
	response.Body.SupportsReadMemoryRequest = false
	response.Body.SupportsDisassembleRequest = false
	response.Body.SupportsCancelRequest = false
	response.Body.SupportsBreakpointLocationsRequest = false
	// This is a fake set up, so we can start "accepting" configuration
	// requests for setting breakpoints, etc from the client at any time.
	// Notify the client with an 'initialized' event. The client will end
	// the configuration sequence with 'configurationDone' request.
	e := &dap.InitializedEvent{Event: *newEvent("initialized")}
	ds.send(e)
	ds.send(response)
}

type launchArgs struct {
	Binary       string            `json:"binary"`
	Port         *int16            `json:"port,omitempty"`
	GeoIpHeaders bool              `json:"geoIpHeaders,omitempty"`
	Env          map[string]string `json:"env,omitempty"`
	Headers      map[string]string `json:"headers,omitempty"`
	MemLimit     *int              `json:"mem_limit,omitempty"`
}

func (ds *fakeDebugSession) onLaunchRequest(request *dap.LaunchRequest) {
	var args launchArgs
	err := json.Unmarshal(request.GetArguments(), &args)
	if err != nil {
		ds.send(newErrorResponse(request.Seq, request.Command, "Invalid request"))
		return
	}

	log.Println("Args:")
	log.Println(args)

	params := make([]string, 0, 10)
	params = append(params, "http")
	params = append(params, "--wasm")
	params = append(params, args.Binary)
	params = append(params, "--port")
	port := "8181"
	if args.Port != nil {
		port = strconv.FormatUint(uint64(*args.Port), 10)
	}
	params = append(params, port)

	params = append(params, "-m")
	if args.MemLimit != nil {
		params = append(params, strconv.FormatUint(uint64(*args.MemLimit), 10))
	} else {
		params = append(params, "10000000")
	}

	for k, v := range args.Env {
		params = append(params, "--envs")
		params = append(params, fmt.Sprintf("%s=%s", k, v))
	}

	for k, v := range args.Headers {
		params = append(params, "--headers")
		params = append(params, fmt.Sprintf("%s=%s", k, v))
	}

	if args.GeoIpHeaders {
		params = append(params, "--geo")
	}

	ex := filepath.Join(filepath.Dir(os.Args[0]), appRunnerBinary) // OS-specific binary name
	log.Printf("About to run %s with %v", ex, params)

	cmd = exec.Command(ex, params...)
	stdout, err := cmd.StdoutPipe()
	if err != nil {
		log.Printf("StdoutPipe returned %s", err)
	}
	stderr, err := cmd.StderrPipe()
	if err != nil {
		log.Printf("StderrPipe returned %s", err)
	}

	err = cmd.Start()
	if err != nil {
		log.Printf("cannot start %s: %v", ex, err)
		ds.send(newErrorResponse(request.Seq, request.Command, "Invalid request"))
		return
	}

	var wg sync.WaitGroup
	wg.Add(2)
	go func() {
		processOutput(ds, stderr, "stderr")
		wg.Done()
	}()
	go func() {
		processOutput(ds, stdout, "stdout")
		wg.Done()
	}()

	// This is where a real debug adaptor would check the soundness of the
	// arguments (e.g. program from launch.json) and then use them to launch the
	// debugger and attach to the program.
	response := &dap.LaunchResponse{}
	response.Response = *newResponse(request.Seq, request.Command)
	ds.send(response)

	e := &dap.OutputEvent{
		Event: *newEvent("output"),
		Body: dap.OutputEventBody{
			Category: "stderr",
			Output:   "Serving on http://localhost:" + port + "\n",
		},
	}
	ds.send(e)

/*	err = cmd.Run()
	if err != nil {
		log.Printf("cannot run %s: %v", ex, err)
		ds.send(newErrorResponse(request.Seq, request.Command, "Invalid request"))
		return
	} */

	wg.Wait()
	log.Printf("waitgroup ended")
	cmd.Wait()
	log.Printf("process ended")
}

func processOutput(ds *fakeDebugSession, pipe io.Reader, pipeName string) {
	log.Printf("Reading %s...", pipeName)
	buf := make([]byte, 1024)
	for {
		count, err := pipe.Read(buf)
		if count > 0 {
			e := &dap.OutputEvent{
				Event: *newEvent("output"),
				Body: dap.OutputEventBody{
					Category: pipeName,
					Output:   string(buf[:count]),
				},
			}
			ds.send(e)
			log.Printf("%s: %s", pipeName, buf[:count])
		}
		if err != nil {
			log.Printf("%s while reading from %s", err, pipeName)
			break
		}
	}
}

func (ds *fakeDebugSession) onDisconnectRequest(request *dap.DisconnectRequest) {
	cmd.Process.Kill()

	response := &dap.DisconnectResponse{}
	response.Response = *newResponse(request.Seq, request.Command)
	ds.send(response)
}

func newEvent(event string) *dap.Event {
	return &dap.Event{
		ProtocolMessage: dap.ProtocolMessage{
			Seq:  0,
			Type: "event",
		},
		Event: event,
	}
}

func newResponse(requestSeq int, command string) *dap.Response {
	return &dap.Response{
		ProtocolMessage: dap.ProtocolMessage{
			Seq:  0,
			Type: "response",
		},
		Command:    command,
		RequestSeq: requestSeq,
		Success:    true,
	}
}

func newErrorResponse(requestSeq int, command string, _ string) *dap.ErrorResponse {
	er := &dap.ErrorResponse{}
	er.Response = *newResponse(requestSeq, command)
	er.Success = false
	er.Message = "unsupported"
	return er
}
