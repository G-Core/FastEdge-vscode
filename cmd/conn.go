package main

import (
	"net"
	"os"
	"time"
)

type DummyAddr struct{}

func (a DummyAddr) Network() string { return "pipe" }
func (a DummyAddr) String() string  { return "pipe" }

type LocalConn struct {
	in  *os.File
	out *os.File
}

func NewLocalConn(in, out *os.File) LocalConn {
	return LocalConn{in, out}
}

func (c LocalConn) Read(b []byte) (n int, err error) {
	return c.in.Read(b)
}

func (c LocalConn) Write(b []byte) (n int, err error) {
	return c.out.Write(b)
}

func (c LocalConn) Close() error { return nil }

func (c LocalConn) LocalAddr() net.Addr { return DummyAddr{} }

func (c LocalConn) RemoteAddr() net.Addr { return DummyAddr{} }

func (c LocalConn) SetDeadline(t time.Time) error {
	err := c.in.SetReadDeadline(t)
	if err != nil {
		return err
	}
	return c.out.SetWriteDeadline(t)
}

func (c LocalConn) SetReadDeadline(t time.Time) error {
	return c.in.SetReadDeadline(t)
}

func (c LocalConn) SetWriteDeadline(t time.Time) error {
	return c.out.SetWriteDeadline(t)
}
